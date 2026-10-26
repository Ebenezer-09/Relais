import { EventEmitter } from 'node:events';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import pino from 'pino';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { syncDir } from '../mirror.js';
import type { Json } from '../types.js';

export type WaStatus = 'disconnected' | 'connecting' | 'qr' | 'pairing' | 'connected';
export interface WaSnapshot { id: string; status: WaStatus; qr?: string; pairingCode?: string; number?: string; method: 'qr' | 'pairing' }
export interface WaMessage { sessionId: string; messageId: string; jid: string; from: string; name: string; text: string; isGroup: boolean; fromMe: boolean }

interface Session {
  id: string; sock?: any; status: WaStatus; qr?: string; pairingCode?: string; number?: string;
  method: 'qr' | 'pairing'; phone?: string; stopping: boolean; retry: number; timer?: NodeJS.Timeout; pairingAsked: boolean;
}

const logger = pino({ level: process.env.WA_LOG_LEVEL ?? 'silent' });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const validSessionId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);
const digits = (s: string) => String(s).replace(/\D/g, '');

function toJid(to: string): string {
  const t = String(to).trim();
  if (t.includes('@')) return t;
  const d = digits(t);
  if (d.length < 6) throw new Error(`Numéro WhatsApp invalide : « ${to} »`);
  return `${d}@s.whatsapp.net`;
}

function extractText(m: any): string {
  const msg = m?.message ?? {};
  return msg.conversation ?? msg.extendedTextMessage?.text ?? msg.imageMessage?.caption ?? msg.videoMessage?.caption ?? msg.documentMessage?.caption
    ?? msg.ephemeralMessage?.message?.conversation ?? msg.ephemeralMessage?.message?.extendedTextMessage?.text ?? '';
}

class WhatsAppManager extends EventEmitter {
  private sessions = new Map<string, Session>();
  private dir = (id: string) => join(config.dataDir, 'wa', id);

  snapshot(id: string): WaSnapshot {
    const s = this.sessions.get(id);
    if (!s) return { id, status: 'disconnected', method: 'qr' };
    return { id, status: s.status, qr: s.qr, pairingCode: s.pairingCode, number: s.number, method: s.method };
  }

  private publish(s: Session) { this.emit('update', this.snapshot(s.id)); }

  async connect(id: string, opts: { method?: 'qr' | 'pairing'; phone?: string } = {}): Promise<WaSnapshot> {
    if (!validSessionId(id)) throw new Error('Identifiant de session invalide');
    const method = opts.method === 'pairing' ? 'pairing' : 'qr';
    if (method === 'pairing' && digits(opts.phone ?? '').length < 6) throw new Error('Le numéro est obligatoire pour le code de jumelage');
    const existing = this.sessions.get(id);
    if (existing) await this.stop(id, false);
    const s: Session = { id, status: 'connecting', method, phone: opts.phone ? digits(opts.phone) : undefined, stopping: false, retry: 0, pairingAsked: false };
    this.sessions.set(id, s);
    this.publish(s);
    await this.start(s);
    return this.snapshot(id);
  }

  private async start(s: Session): Promise<void> {
    const baileys: any = await import('@whiskeysockets/baileys');
    const makeWASocket = baileys.default?.default ?? baileys.default ?? baileys.makeWASocket;
    const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = baileys;
    const dir = this.dir(s.id);
    const { state, saveCreds } = await useMultiFileAuthState(dir);
    // chaque écriture de session est recopiée dans Postgres (si DATABASE_URL), pour survivre à un disque effacé
    const setKeys = state.keys.set.bind(state.keys);
    state.keys.set = async (data: any) => { await setKeys(data); syncDir(dir); };
    let version: number[] | undefined;
    try { version = (await fetchLatestBaileysVersion()).version; } catch { /* version embarquée */ }

    const sock = makeWASocket({
      ...(version ? { version } : {}), auth: state, logger, browser: Browsers.ubuntu('Relais'),
      printQRInTerminal: false, syncFullHistory: false, markOnlineOnConnect: false,
    });
    s.sock = sock;
    sock.ev.on('creds.update', async () => { await saveCreds(); syncDir(dir); });

    sock.ev.on('connection.update', async (u: any) => {
      if (s.sock !== sock) return;
      const { connection, lastDisconnect, qr } = u;
      if (qr) {
        if (s.method === 'pairing' && s.phone && !s.pairingAsked && !sock.authState?.creds?.registered) {
          s.pairingAsked = true;
          try {
            const code: string = await sock.requestPairingCode(s.phone);
            s.pairingCode = code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
            s.status = 'pairing';
          } catch (e: any) { logger.error(e); s.pairingAsked = false; }
        } else if (s.method === 'qr') {
          s.qr = await QRCode.toDataURL(qr, { margin: 1, width: 300 });
          s.status = 'qr';
        }
        this.publish(s);
      }
      if (connection === 'open') {
        s.status = 'connected'; s.qr = undefined; s.pairingCode = undefined; s.retry = 0;
        s.number = digits(String(sock.user?.id ?? '').split(':')[0].split('@')[0]);
        this.publish(s);
      }
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        if (s.stopping) return;
        if (code === DisconnectReason.loggedOut) {
          rmSync(this.dir(s.id), { recursive: true, force: true }); syncDir(this.dir(s.id));
          s.status = 'disconnected'; s.qr = undefined; s.pairingCode = undefined; s.number = undefined; s.sock = undefined;
          this.publish(s);
          return;
        }
        s.status = 'connecting'; s.qr = undefined; this.publish(s);
        // 515 (restartRequired) arrive juste après le scan : reconnexion immédiate
        const delay = code === DisconnectReason.restartRequired ? 500 : Math.min(30_000, 2000 * 2 ** s.retry++);
        s.timer = setTimeout(() => { if (!s.stopping) this.start(s).catch((e) => logger.error(e)); }, delay);
      }
    });

    sock.ev.on('messages.upsert', ({ messages, type }: any) => {
      if (type !== 'notify') return;
      for (const m of messages ?? []) {
        const jid: string = m.key?.remoteJid ?? '';
        if (!jid || jid === 'status@broadcast') continue;
        const text = extractText(m);
        if (!text) continue;
        const alt: string = m.key?.remoteJidAlt ?? '';
        const phoneJid = jid.endsWith('@lid') && alt ? alt : jid;
        const msg: WaMessage = {
          sessionId: s.id, messageId: m.key?.id ?? '', jid, from: digits(phoneJid.split('@')[0]),
          name: m.pushName ?? '', text, isGroup: jid.endsWith('@g.us'), fromMe: !!m.key?.fromMe,
        };
        this.emit('message', msg);
      }
    });
  }

  async stop(id: string, logout: boolean): Promise<void> {
    const s = this.sessions.get(id);
    if (!s) return;
    s.stopping = true;
    clearTimeout(s.timer);
    try { if (logout) await s.sock?.logout(); else s.sock?.end?.(undefined); } catch { /* déjà fermé */ }
    if (logout) { rmSync(this.dir(id), { recursive: true, force: true }); syncDir(this.dir(id)); }
    s.status = 'disconnected'; s.qr = undefined; s.pairingCode = undefined; s.sock = undefined;
    if (logout) s.number = undefined;
    this.publish(s);
    this.sessions.delete(id);
  }

  disconnect(id: string) { return this.stop(id, true); }

  /** Reconnecte au démarrage les sessions déjà appairées (dossier d'authentification présent) */
  async restoreAll(): Promise<void> {
    const root = join(config.dataDir, 'wa');
    if (!existsSync(root)) return;
    for (const id of readdirSync(root)) {
      if (validSessionId(id) && existsSync(join(root, id, 'creds.json'))) {
        this.connect(id, { method: 'qr' }).catch((e) => logger.error(e));
      }
    }
  }

  async shutdown() { for (const id of [...this.sessions.keys()]) await this.stop(id, false); }

  private ready(id: string): any {
    const s = this.sessions.get(id);
    if (!s || s.status !== 'connected' || !s.sock) throw new Error(`Session WhatsApp « ${id} » non connectée`);
    return s.sock;
  }

  async sendText(id: string, to: string, text: string): Promise<string> {
    const r = await this.ready(id).sendMessage(toJid(to), { text });
    return r?.key?.id ?? '';
  }
  async sendMedia(id: string, to: string, url: string, caption?: string): Promise<string> {
    const ext = (url.split('?')[0].split('.').pop() ?? '').toLowerCase();
    const content: Json = /^(jpe?g|png|webp|gif)$/.test(ext) ? { image: { url }, caption }
      : /^(mp4|mov|webm)$/.test(ext) ? { video: { url }, caption }
      : /^(mp3|ogg|m4a|wav|opus)$/.test(ext) ? { audio: { url } }
      : { document: { url }, mimetype: 'application/octet-stream', fileName: url.split('?')[0].split('/').pop() || 'fichier', caption };
    const r = await this.ready(id).sendMessage(toJid(to), content);
    return r?.key?.id ?? '';
  }
  async typing(id: string, to: string, ms: number): Promise<void> {
    const sock = this.ready(id), jid = toJid(to);
    await sock.sendPresenceUpdate('composing', jid);
    await sleep(Math.min(ms, 30_000));
    await sock.sendPresenceUpdate('paused', jid);
  }
}

export const wa = new WhatsAppManager();
