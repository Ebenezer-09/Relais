import cron from 'node-cron';
import { state, workflows } from './db.js';
import { findTrigger, runWorkflow, validateGraph } from './engine/executor.js';
import { sessionOf } from './nodes/whatsapp.js';
import { tgCall } from './nodes/telegram.js';
import { fetchUnread } from './services/gmail.js';
import { wa, type WaMessage } from './services/whatsapp.js';
import type { Json, WorkflowNode, WorkflowRecord } from './types.js';
import { loadCred, field } from './nodes/util.js';
import { timingSafeEqual } from 'node:crypto';

type Stop = () => void;
const active = new Map<string, Stop[]>();
const webhookIndex = new Map<string, string>(); // "METHOD /path" -> workflowId

const log = (...a: unknown[]) => console.log('[triggers]', ...a);
export const normPath = (p: string) => '/' + String(p ?? '').trim().replace(/^\/+|\/+$/g, '');

/** Lance une exécution en arrière-plan (ne bloque pas l'événement entrant) */
export function fire(workflowId: string, items: Json[], mode: 'production' | 'test' = 'production') {
  const wf = workflows.get(workflowId);
  if (!wf) return Promise.resolve(undefined);
  return runWorkflow(wf, { mode, triggerItems: items }).then((ex) => {
    if (ex.status === 'error') log(`workflow ${wf.name} (${wf.id}) en erreur : ${ex.error}`);
    return ex;
  });
}

export function secretOk(given: string | undefined, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface WebhookMatch { workflow: WorkflowRecord; trigger: WorkflowNode }
export function webhookConfig(wf: WorkflowRecord) {
  const t = findTrigger(wf.graph);
  if (!t || t.trigger !== 'API / Webhook') return undefined;
  return { trigger: t, path: normPath(t.config.path || '/'), method: String(t.config.method || 'POST').toUpperCase() };
}
export function findWebhook(method: string, path: string, testMode: boolean): WebhookMatch | undefined {
  const candidates = testMode ? workflows.list() : [...new Set(webhookIndex.values())].map((id) => workflows.get(id)!).filter(Boolean);
  for (const wf of candidates) {
    const c = webhookConfig(wf);
    if (c && c.path === normPath(path) && c.method === method.toUpperCase()) return { workflow: wf, trigger: c.trigger };
  }
  return undefined;
}

/* ------------------------------------------------------------------ */

function lines(v: unknown): string[] {
  return String(v ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
}

function startTelegram(wf: WorkflowRecord, t: WorkflowNode): Stop {
  const cred = loadCred(t.config);
  const token = field(t.config, cred, 'botToken');
  if (!token) throw new Error('Token du bot Telegram manquant');
  const allowed = new Set(lines(t.config.allowed));
  const key = `tg_offset:${wf.id}`;
  let offset = Number(state.get(key) ?? 0);
  const ctl = new AbortController();
  (async () => {
    try { await tgCall(token, 'deleteWebhook', { drop_pending_updates: false }); } catch (e: any) { log('telegram deleteWebhook:', e.message); }
    let backoff = 1000;
    while (!ctl.signal.aborted) {
      try {
        const updates: any[] = await tgCall(token, 'getUpdates', { offset, timeout: 25, allowed_updates: ['message'] }, 40_000);
        backoff = 1000;
        for (const u of updates) {
          offset = u.update_id + 1;
          state.set(key, String(offset));
          const m = u.message;
          if (!m?.text) continue;
          const chatId = String(m.chat.id);
          if (allowed.size && !allowed.has(chatId)) continue;
          fire(wf.id, [{ text: m.text, chat_id: chatId, username: m.from?.username ?? m.from?.first_name ?? '', message_id: m.message_id }]);
        }
      } catch (e: any) {
        if (ctl.signal.aborted) break;
        log(`telegram (${wf.name}) :`, e.message);
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, 60_000);
      }
    }
  })();
  return () => ctl.abort();
}

function startWhatsApp(wf: WorkflowRecord, t: WorkflowNode): Stop {
  const sid = sessionOf(t.config);
  const allowed = new Set(lines(t.config.allowed).map((s) => s.replace(/\D/g, '')));
  const ignoreGroups = t.config.ignoreGroups !== false;
  const ignoreOwn = t.config.ignoreOwn !== false;
  const handler = (m: WaMessage) => {
    if (m.sessionId !== sid) return;
    if (ignoreGroups && m.isGroup) return;
    if (ignoreOwn && m.fromMe) return;
    if (allowed.size && !allowed.has(m.from)) return;
    fire(wf.id, [{ text: m.text, from: m.from, name: m.name, jid: m.jid, is_group: m.isGroup, message_id: m.messageId }]);
  };
  wa.on('message', handler);
  return () => wa.off('message', handler);
}

function startGmail(wf: WorkflowRecord, t: WorkflowNode): Stop {
  const credId = String(t.config.credentialId ?? '');
  if (!credId) throw new Error('Compte Google manquant');
  const every = Math.max(15, Number(t.config.poll) || 60) * 1000;
  let busy = false;
  const tick = async () => {
    if (busy) return; busy = true;
    try {
      const mails = await fetchUnread(credId, { from: t.config.filterFrom ? String(t.config.filterFrom) : undefined });
      for (const m of mails) fire(wf.id, [m]);
    } catch (e: any) { log(`gmail (${wf.name}) :`, e.message); } finally { busy = false; }
  };
  const h = setInterval(tick, every);
  tick();
  return () => clearInterval(h);
}

function startSchedule(wf: WorkflowRecord, t: WorkflowNode): Stop {
  const c = t.config;
  const emit = () => fire(wf.id, [{ date: new Date().toISOString() }]);
  if (c.mode === 'Expression cron') {
    const expr = String(c.cron ?? '').trim();
    if (!cron.validate(expr)) throw new Error(`Expression cron invalide : « ${expr} »`);
    const task = cron.schedule(expr, emit, { timezone: String(c.tz || 'UTC') });
    return () => task.stop();
  }
  const unit = c.unit === 'heures' ? 3_600_000 : c.unit === 'jours' ? 86_400_000 : 60_000;
  const ms = Math.max(10_000, (Number(c.every) || 15) * unit);
  const h = setInterval(emit, ms);
  return () => clearInterval(h);
}

/* ------------------------------------------------------------------ */

export function activate(id: string): { ok: true } | { ok: false; errors: string[] } {
  const wf = workflows.get(id);
  if (!wf) return { ok: false, errors: ['Workflow introuvable'] };
  deactivate(id, false);
  const errors = validateGraph(wf.graph);
  const t = findTrigger(wf.graph);
  if (errors.length || !t) return { ok: false, errors: errors.length ? errors : ['Aucun déclencheur'] };
  const stops: Stop[] = [];
  try {
    switch (t.trigger) {
      case 'API / Webhook': {
        const w = webhookConfig(wf)!;
        const clash = findWebhook(w.method, w.path, false);
        if (clash && clash.workflow.id !== id) throw new Error(`Le chemin ${w.method} ${w.path} est déjà utilisé par « ${clash.workflow.name} »`);
        webhookIndex.set(`${w.method} ${w.path}`, id);
        stops.push(() => webhookIndex.delete(`${w.method} ${w.path}`));
        break;
      }
      case 'Message Telegram': stops.push(startTelegram(wf, t)); break;
      case 'Message WhatsApp': stops.push(startWhatsApp(wf, t)); break;
      case 'Email entrant': stops.push(startGmail(wf, t)); break;
      case 'Planification': stops.push(startSchedule(wf, t)); break;
      case 'Clic manuel': throw new Error('Un déclencheur manuel ne peut pas être activé : lancez-le avec « Exécuter »');
      default: throw new Error(`Déclencheur inconnu : ${t.trigger}`);
    }
  } catch (e: any) {
    stops.forEach((s) => s());
    return { ok: false, errors: [e.message] };
  }
  active.set(id, stops);
  workflows.setActive(id, true);
  log(`activé : ${wf.name} (${t.trigger})`);
  return { ok: true };
}

export function deactivate(id: string, persist = true) {
  active.get(id)?.forEach((s) => s());
  active.delete(id);
  if (persist) workflows.setActive(id, false);
}

export function activateAll() {
  for (const wf of workflows.list().filter((w) => w.active)) {
    const r = activate(wf.id);
    if (!r.ok) { log(`échec d'activation de ${wf.name} :`, r.errors.join(' ; ')); workflows.setActive(wf.id, false); }
  }
}
export function deactivateAll() { for (const id of [...active.keys()]) deactivate(id, false); }
export const isRunning = (id: string) => active.has(id);
