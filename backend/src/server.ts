import cors from '@fastify/cors';
import { randomBytes } from 'node:crypto';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { assertProductionConfig, config } from './config.js';
import { credentials, executions, shares, workflows } from './db.js';
import { flush } from './mirror.js';
import { execEvents, findTrigger, runWorkflow, validateGraph } from './engine/executor.js';
import { accessToken, googleScope, profileEmail } from './services/gmail.js';
import { http, apiError } from './services/http.js';
import { validSessionId, wa } from './services/whatsapp.js';
import { activate, activateAll, deactivate, deactivateAll, fire, findWebhook, isRunning, normPath, secretOk, webhookConfig } from './triggers.js';
import type { ExecutionRecord, Json, WorkflowGraph, WorkflowRecord } from './types.js';

export async function buildServer() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' ? {
    level: 'info', redact: ['req.headers.authorization', 'req.headers["x-api-key"]'],
    // le flux SSE reçoit la clé d'API en ?token= : on la masque dans les logs
    serializers: { req: (r: FastifyRequest) => ({ method: r.method, url: r.url.replace(/([?&]token=)[^&]*/, '$1***'), host: r.hostname, remoteAddress: r.ip }) },
  } : false, bodyLimit: 5 * 1024 * 1024,
  // derrière le proxy Render : l'IP réelle est le dernier saut (non falsifiable par le client)
  trustProxy: (_addr: string, hop: number) => hop === 0 });
  await app.register(cors, { origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(','), allowedHeaders: ['authorization', 'content-type'], methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] });

  const publicWebhook = (kind: 'webhook' | 'webhook-test', path: string) => `${config.publicUrl}/${kind}${normPath(path)}`;
  const present = (wf: WorkflowRecord) => {
    const w = webhookConfig(wf);
    return { ...wf, running: isRunning(wf.id), shareToken: shares.tokenOf(wf.id) ?? null, ...(w ? { webhook: { method: w.method, test: publicWebhook('webhook-test', w.path), production: publicWebhook('webhook', w.path) } } : {}) };
  };
  const graphFrom = (body: any): WorkflowGraph | undefined => {
    const g = body?.graph ?? body;
    return g && Array.isArray(g.nodes) && Array.isArray(g.edges) ? { nodes: g.nodes, edges: g.edges } : undefined;
  };

  /** Ouvre un flux SSE ; renvoie send(), et appelle onClose à la déconnexion du navigateur */
  const openSse = (req: FastifyRequest, reply: FastifyReply, onClose: () => void) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'access-control-allow-origin': config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',')[0] });
    const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.raw.on('close', () => { clearInterval(ping); onClose(); });
    return (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  app.get('/api/health', async () => ({ ok: true, time: Date.now() }));

  /* ---------- workflows ---------- */
  app.get('/api/workflows', async () => workflows.list().map(present));
  app.post('/api/workflows', async (req, reply) => {
    const b = req.body as any; const graph = graphFrom(b);
    if (!graph) return reply.code(400).send({ error: 'graph { nodes, edges } requis' });
    return reply.code(201).send(present(workflows.create(String(b.name || findTrigger(graph)?.name || 'Sans titre'), graph)));
  });
  app.get('/api/workflows/:id', async (req, reply) => {
    const wf = workflows.get((req.params as any).id);
    return wf ? present(wf) : reply.code(404).send({ error: 'Introuvable' });
  });
  app.put('/api/workflows/:id', async (req, reply) => {
    const id = (req.params as any).id, b = req.body as any;
    const graph = b?.graph || b?.nodes ? graphFrom(b) : undefined;
    if ((b?.graph || b?.nodes) && !graph) return reply.code(400).send({ error: 'graph invalide' });
    const wf = workflows.update(id, { name: b?.name, graph });
    if (!wf) return reply.code(404).send({ error: 'Introuvable' });
    // un workflow actif est ré-enregistré avec sa nouvelle définition
    if (wf.active) { const r = activate(id); if (!r.ok) { workflows.setActive(id, false); return reply.code(200).send({ ...present(workflows.get(id)!), warning: `Désactivé : ${r.errors.join(' ; ')}` }); } }
    return present(workflows.get(id)!);
  });
  app.delete('/api/workflows/:id', async (req, reply) => {
    const id = (req.params as any).id;
    if (!workflows.get(id)) return reply.code(404).send({ error: 'Introuvable' });
    deactivate(id, false); workflows.remove(id);
    return { ok: true };
  });
  app.post('/api/workflows/:id/activate', async (req, reply) => {
    const id = (req.params as any).id;
    const r = activate(id);
    return r.ok ? present(workflows.get(id)!) : reply.code(400).send({ error: r.errors.join(' ; '), errors: r.errors });
  });
  app.post('/api/workflows/:id/deactivate', async (req, reply) => {
    const id = (req.params as any).id;
    if (!workflows.get(id)) return reply.code(404).send({ error: 'Introuvable' });
    deactivate(id); return present(workflows.get(id)!);
  });

  /* ---------- exécution manuelle ---------- */
  const toItems = (v: unknown): Json[] | undefined => v === undefined ? undefined : (Array.isArray(v) ? v : [v]).map((x) => (x && typeof x === 'object' ? x as Json : { value: x }));
  app.post('/api/workflows/:id/run', async (req, reply) => {
    const wf = workflows.get((req.params as any).id);
    if (!wf) return reply.code(404).send({ error: 'Introuvable' });
    const b = (req.body ?? {}) as any;
    return runWorkflow(wf, { mode: 'manual', triggerItems: toItems(b.input), pinned: b.pinned, startNodeId: b.startNodeId, seedOutputs: b.seedOutputs, onlyStart: !!b.onlyStart });
  });
  /** Exécution d'un graphe non enregistré (bouton « Tester » du builder) — non persistée */
  app.post('/api/run', async (req, reply) => {
    const b = (req.body ?? {}) as any; const graph = graphFrom(b);
    if (!graph) return reply.code(400).send({ error: 'graph { nodes, edges } requis' });
    const problems = validateGraph(graph);
    if (problems.length) return reply.code(400).send({ error: problems.join(' ; '), errors: problems });
    return runWorkflow({ id: 'adhoc', name: 'adhoc', graph }, { mode: 'manual', persist: false, triggerItems: toItems(b.input), pinned: b.pinned, startNodeId: b.startNodeId, seedOutputs: b.seedOutputs, onlyStart: !!b.onlyStart });
  });

  /* ---------- exécutions ---------- */
  app.get('/api/executions', async (req) => {
    const q = req.query as any;
    return executions.list(q.workflowId, Math.min(200, Number(q.limit) || 50));
  });
  app.get('/api/executions/:id', async (req, reply) => executions.get((req.params as any).id) ?? reply.code(404).send({ error: 'Introuvable' }));

  /* ---------- identifiants (jamais renvoyés en clair) ---------- */
  app.get('/api/credentials', async () => credentials.list());
  app.post('/api/credentials', async (req, reply) => {
    const b = (req.body ?? {}) as any;
    if (!b.name || !b.type || typeof b.data !== 'object') return reply.code(400).send({ error: 'name, type et data requis' });
    return reply.code(201).send(credentials.create(String(b.name), String(b.type), b.data));
  });
  app.put('/api/credentials/:id', async (req, reply) => {
    const b = (req.body ?? {}) as any;
    return credentials.update((req.params as any).id, { name: b.name, data: b.data }) ?? reply.code(404).send({ error: 'Introuvable' });
  });
  app.delete('/api/credentials/:id', async (req) => { credentials.remove((req.params as any).id); return { ok: true }; });

  /* ---------- OAuth Google (compte Gmail) ---------- */
  const oauthStates = new Map<string, { credId: string; exp: number }>();
  const redirectUri = `${config.publicUrl}/oauth/google/callback`;
  app.post('/api/oauth/google/url', async (req, reply) => {
    const credId = String((req.body as any)?.credentialId ?? '');
    const d = credentials.getData(credId);
    if (!d?.clientId || !d?.clientSecret) return reply.code(400).send({ error: 'Identifiant Google sans clientId / clientSecret' });
    const st = randomBytes(24).toString('hex');
    oauthStates.set(st, { credId, exp: Date.now() + 10 * 60_000 });
    const p = new URLSearchParams({ client_id: d.clientId, redirect_uri: redirectUri, response_type: 'code', scope: googleScope, access_type: 'offline', prompt: 'consent', state: st });
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${p}`, redirectUri };
  });
  app.get('/oauth/google/callback', async (req, reply) => {
    const q = req.query as any;
    const page = (msg: string, ok: boolean) => reply.type('text/html; charset=utf-8').send(`<!doctype html><meta charset=utf-8><title>Google</title><body style="font-family:sans-serif;background:#121316;color:#e3e2e6;display:grid;place-items:center;height:100vh"><div><h2>${ok ? '✅' : '❌'} ${msg.replace(/[<>&]/g, '')}</h2><p>Vous pouvez fermer cet onglet.</p></div>`);
    const st = oauthStates.get(String(q.state)); oauthStates.delete(String(q.state));
    if (!st || st.exp < Date.now()) return page('Lien expiré, recommencez depuis le builder', false);
    if (q.error || !q.code) return page(`Autorisation refusée (${q.error ?? 'aucun code'})`, false);
    const d = credentials.getData(st.credId);
    if (!d) return page('Identifiant introuvable', false);
    const r = await http('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: String(q.code), client_id: d.clientId, client_secret: d.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }).toString() });
    if (!r.ok) return page(apiError('Google', r).message, false);
    if (!r.data.refresh_token) return page("Google n'a pas renvoyé de refresh_token : révoquez l'accès de l'application puis recommencez", false);
    credentials.update(st.credId, { data: { refreshToken: r.data.refresh_token } });
    let email = '';
    try { await accessToken(st.credId); email = await profileEmail(st.credId); credentials.update(st.credId, { data: { email } }); } catch { /* facultatif */ }
    return page(`Compte Google connecté${email ? ' : ' + email : ''}`, true);
  });

  /* ---------- WhatsApp (Baileys) ---------- */
  const sid = (req: FastifyRequest, reply: FastifyReply): string | undefined => {
    const id = (req.params as any).id;
    if (validSessionId(id)) return id;
    reply.code(400).send({ error: 'Identifiant de session invalide' }); return undefined;
  };
  app.get('/api/whatsapp/:id/status', async (req, reply) => { const id = sid(req, reply); if (id) return wa.snapshot(id); });
  app.post('/api/whatsapp/:id/connect', async (req, reply) => {
    const id = sid(req, reply); if (!id) return;
    const b = (req.body ?? {}) as any;
    try { return await wa.connect(id, { method: b.method, phone: b.phone }); } catch (e: any) { return reply.code(400).send({ error: e.message }); }
  });
  app.post('/api/whatsapp/:id/disconnect', async (req, reply) => { const id = sid(req, reply); if (!id) return; await wa.disconnect(id); return wa.snapshot(id); });
  app.get('/api/whatsapp/:id/events', (req, reply) => {
    const id = sid(req, reply); if (!id) return;
    const on = (s: any) => { if (s.id === id) send(s); };
    const send = openSse(req, reply, () => wa.off('update', on));
    send(wa.snapshot(id));
    wa.on('update', on);
  });

  /* ---------- lien de partage client ---------- */
  app.post('/api/workflows/:id/share', async (req, reply) => {
    const id = (req.params as any).id;
    if (!workflows.get(id)) return reply.code(404).send({ error: 'Introuvable' });
    return { shareToken: shares.renew(id) };
  });
  app.delete('/api/workflows/:id/share', async (req) => { shares.revoke((req.params as any).id); return { shareToken: null }; });

  /* ---------- vue client publique (lecture seule, sans authentification) ----------
     On n'envoie jamais node.config : il contient les clés d'API, tokens et le code des blocs. */
  const publicNode = ({ id, type, name, trigger, x, y }: WorkflowGraph['nodes'][number]) => ({ id, type, name, trigger, x, y });
  const sharedWorkflow = (req: FastifyRequest, reply: FastifyReply): WorkflowRecord | undefined => {
    const wfId = shares.workflowOf(String((req.params as any).token ?? ''));
    const wf = wfId ? workflows.get(wfId) : undefined;
    if (!wf) reply.code(404).send({ error: 'Lien invalide ou révoqué' });
    return wf;
  };
  const summaryOf = (e: ExecutionRecord) => ({ id: e.id, mode: e.mode, status: e.status, startedAt: e.startedAt, finishedAt: e.finishedAt, error: e.error });
  app.get('/public/:token', async (req, reply) => {
    const wf = sharedWorkflow(req, reply); if (!wf) return;
    return {
      name: wf.name, active: isRunning(wf.id),
      graph: { nodes: wf.graph.nodes.map(publicNode), edges: wf.graph.edges },
      executions: executions.list(wf.id, 30).map(summaryOf),
    };
  });
  app.get('/public/:token/executions/:execId', async (req, reply) => {
    const wf = sharedWorkflow(req, reply); if (!wf) return;
    const ex = executions.get((req.params as any).execId);
    return ex && ex.workflowId === wf.id ? ex : reply.code(404).send({ error: 'Introuvable' });
  });
  app.get('/public/:token/events', (req, reply) => {
    const wf = sharedWorkflow(req, reply); if (!wf) return;
    const on = (ex: ExecutionRecord) => { if (ex.workflowId === wf.id) send(ex); };
    const send = openSse(req, reply, () => execEvents.off('update', on));
    execEvents.on('update', on);
  });

  /* ---------- webhooks publics (production et test) ---------- */
  const webhook = (testMode: boolean) => async (req: FastifyRequest, reply: FastifyReply) => {
    const path = '/' + String((req.params as any)['*'] ?? '');
    const m = findWebhook(req.method, path, testMode);
    if (!m) return reply.code(404).send({ error: 'Webhook inconnu ou workflow inactif' });
    const c = m.trigger.config;
    const auth = String(c.auth || 'Aucune');
    if (auth !== 'Aucune') {
      const secret = String(c.secret ?? '');
      const ok = secret && (auth === 'Bearer token'
        ? secretOk((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''), secret)
        : secretOk(String(req.headers['x-api-key'] ?? ''), secret));
      if (!ok) return reply.code(401).send({ error: 'Non autorisé' });
    }
    const item: Json = { body: req.body ?? {}, query: req.query ?? {}, headers: { ...req.headers, authorization: undefined, 'x-api-key': undefined } };
    const wait = String(c.responseMode || '').startsWith('Attendre');
    const run = fire(m.workflow.id, [item], testMode ? 'test' : 'production');
    if (!wait) { run.catch(() => {}); return reply.code(200).send({ ok: true }); }
    const ex = await run;
    if (!ex || ex.status === 'error') return reply.code(500).send({ error: ex?.error ?? 'Erreur' });
    const r = ex.result ?? [];
    return reply.send(r.length === 1 ? r[0] : r);
  };
  for (const [prefix, test] of [['/webhook', false], ['/webhook-test', true]] as const) {
    app.route({ method: ['GET', 'POST', 'PUT'], url: `${prefix}/*`, handler: webhook(test) });
  }
  return app;
}

/* ------------------------------ démarrage ------------------------------ */
const isMain = process.argv[1] && /server\.(ts|js)$/.test(process.argv[1]);
if (isMain) {
  assertProductionConfig();
  const app = await buildServer();
  executions.failStale();
  await app.listen({ port: config.port, host: config.host });
  activateAll();
  wa.restoreAll().catch((e) => app.log.error(e));
  const stop = async () => { deactivateAll(); await wa.shutdown(); await app.close(); await flush(); process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
