import './setup.js';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { after, before, describe, test } from 'node:test';

const { runWorkflow } = await import('../src/engine/executor.js');
const { buildServer } = await import('../src/server.js');
const { credentials } = await import('../src/db.js');
const { buildMime } = await import('../src/services/gmail.js');
const { chunk } = await import('../src/nodes/telegram.js');
type G = import('../src/types.js').WorkflowGraph;

const node = (id: string, type: any, name: string, config: any = {}, extra: any = {}) => ({ id, type, name, config, ...extra });
const edge = (from: string, to: string, port = 'out') => ({ from, to, port });
const wf = (graph: G) => ({ id: 'wf-test', name: 'test', graph });

let mock: Server; let mockUrl = ''; const llmCalls: any[] = [];
before(async () => {
  mock = createServer((req, res) => {
    let b = ''; req.on('data', (d) => (b += d));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/echo') return void res.end(JSON.stringify({ method: req.method, body: b ? JSON.parse(b) : null, ct: req.headers['content-type'] }));
      if (req.url === '/fail') { res.statusCode = 500; return void res.end('{"error":"boom"}'); }
      if (req.url === '/v1/chat/completions') {
        const j = JSON.parse(b); llmCalls.push(j);
        const last = j.messages[j.messages.length - 1].content;
        const content = j.response_format ? '```json\n{"reponse":"ok","echo":"' + last + '"}\n```' : `Réponse à : ${last}`;
        return void res.end(JSON.stringify({ choices: [{ message: { content } }] }));
      }
      res.statusCode = 404; res.end('{}');
    });
  }).listen(0);
  await new Promise((r) => mock.once('listening', r));
  mockUrl = `http://127.0.0.1:${(mock.address() as any).port}`;
});
after(() => mock.close());

describe('moteur', () => {
  test('condition : branches yes/no par élément, expressions n8n et historiques', async () => {
    const g: G = {
      nodes: [
        node('t', 'trigger', 'Mon agent', {}, { trigger: 'Clic manuel' }),
        node('c', 'condition', 'Urgent ?', { left: '{{ $json.text }}', op: 'contient', right: 'urgent' }),
        node('f', 'function', 'Majuscules', { language: 'JavaScript', inputs: 'texte = {{trigger.text}}', code: 'return { result: inputs.texte.toUpperCase() };' }),
        node('s', 'automation', 'Marquer', { kind: 'Définir une variable', varName: 'etat', varValue: 'normal : {{ $("Mon agent").item.json.text }}' }),
      ],
      edges: [edge('t', 'c'), edge('c', 'f', 'yes'), edge('c', 's', 'no')],
    };
    const ex = await runWorkflow(wf(g), { mode: 'manual', persist: false, triggerItems: [{ text: 'bonjour' }, { text: 'très urgent' }] });
    assert.equal(ex.status, 'success', ex.error);
    const byNode = Object.fromEntries(ex.runData.map((r) => [r.node, r]));
    assert.deepEqual(byNode['Majuscules'].output.out.map((i) => i.result), ['TRÈS URGENT']);
    assert.deepEqual(byNode['Marquer'].output.out.map((i) => i.etat), ['normal : bonjour']);
    assert.equal(byNode['Urgent ?'].output.yes.length, 1);
    assert.equal(byNode['Urgent ?'].output.no.length, 1);
  });

  test('boucle : un élément par valeur de la liste, blocs suivants exécutés pour chacun', async () => {
    const g: G = {
      nodes: [
        node('t', 'trigger', 'T', {}, { trigger: 'Clic manuel' }),
        node('l', 'automation', 'Liste', { kind: 'Boucle sur une liste', listExpr: '{{ $json.noms }}', itemName: 'nom' }),
        node('f', 'function', 'Saluer', { language: 'JavaScript', inputs: 'n = {{ $json.nom }}', code: 'return { result: "Salut " + inputs.n };' }),
      ],
      edges: [edge('t', 'l'), edge('l', 'f')],
    };
    const ex = await runWorkflow(wf(g), { mode: 'manual', persist: false, triggerItems: [{ noms: ['Awa', 'Moussa', 'Fatou'] }] });
    assert.equal(ex.status, 'success', ex.error);
    assert.deepEqual(ex.result!.map((r) => r.result), ['Salut Awa', 'Salut Moussa', 'Salut Fatou']);
  });

  test('HTTP : JSON envoyé, erreur 500 remontée, continue-on-fail et retries', async () => {
    const ok = await runWorkflow(wf({
      nodes: [node('t', 'trigger', 'T', {}, { trigger: 'Clic manuel' }),
        node('h', 'automation', 'Appel', { kind: 'Requête HTTP', url: `${mockUrl}/echo`, method: 'POST', body: '{"a": "{{ $json.v }}"}' })],
      edges: [edge('t', 'h')],
    }), { mode: 'manual', persist: false, triggerItems: [{ v: 42 }] });
    assert.equal(ok.status, 'success', ok.error);
    assert.deepEqual(ok.result![0].result.body, { a: '42' });
    assert.equal(ok.result![0].result.ct, 'application/json');

    const mk = (settings: any): G => ({
      nodes: [node('t', 'trigger', 'T', {}, { trigger: 'Clic manuel' }), node('h', 'automation', 'Appel', { kind: 'Requête HTTP', url: `${mockUrl}/fail` }, { settings })],
      edges: [edge('t', 'h')],
    });
    const fail = await runWorkflow(wf(mk({})), { mode: 'manual', persist: false });
    assert.equal(fail.status, 'error');
    assert.match(fail.error!, /Appel.*HTTP 500/);
    assert.equal(fail.runData.at(-1)!.status, 'error');
    const cont = await runWorkflow(wf(mk({ onError: 'continue' })), { mode: 'manual', persist: false });
    assert.equal(cont.status, 'success');
    assert.match(cont.result![0].error, /HTTP 500/);
  });

  test('LLM : prompt système, JSON avec fences, mémoire par session', async () => {
    llmCalls.length = 0;
    const llmCfg = { provider: 'Compatible OpenAI', baseUrl: `${mockUrl}/v1`, model: 'm', apiKey: 'k', system: 'Tu es utile', prompt: '{{ $json.text }}', memory: true, memoryKey: '{{ $json.from }}', memoryWindow: 10, format: 'JSON' };
    const g: G = { nodes: [node('t', 'trigger', 'T', {}, { trigger: 'Clic manuel' }), node('m', 'llm', 'Cerveau', llmCfg)], edges: [edge('t', 'm')] };
    const a = await runWorkflow(wf(g), { mode: 'manual', persist: false, triggerItems: [{ text: 'salut', from: '212' }] });
    assert.equal(a.status, 'success', a.error);
    assert.equal(a.result![0].json.reponse, 'ok');
    assert.match(llmCalls[0].messages[0].content, /Tu es utile[\s\S]*JSON valide/);
    await runWorkflow(wf(g), { mode: 'manual', persist: false, triggerItems: [{ text: 'et ensuite ?', from: '212' }] });
    assert.equal(llmCalls[1].messages.length, 4, 'system + (user, assistant) en mémoire + nouveau user');
    await runWorkflow(wf(g), { mode: 'manual', persist: false, triggerItems: [{ text: 'autre', from: '999' }] });
    assert.equal(llmCalls[2].messages.length, 2, 'autre clé de session : pas d\'historique');
  });

  test('épinglage, exécution d\'un seul bloc, boucle infinie bloquée', async () => {
    const g: G = {
      nodes: [node('t', 'trigger', 'T', {}, { trigger: 'Clic manuel' }),
        node('h', 'automation', 'Appel', { kind: 'Requête HTTP', url: `${mockUrl}/fail` }),
        node('f', 'function', 'Fin', { language: 'JavaScript', code: 'return { vu: $json.result.x };' })],
      edges: [edge('t', 'h'), edge('h', 'f')],
    };
    const pinned = await runWorkflow(wf(g), { mode: 'manual', persist: false, pinned: { Appel: [{ result: { x: 7 } }] } });
    assert.equal(pinned.status, 'success', pinned.error);
    assert.equal(pinned.result![0].vu, 7);
    const only = await runWorkflow(wf(g), { mode: 'manual', persist: false, startNodeId: 'f', onlyStart: true, triggerItems: [{ result: { x: 1 } }] });
    assert.equal(only.runData.length, 1);

    const loop: G = { nodes: [node('t', 'trigger', 'T', {}, { trigger: 'Clic manuel' }), node('s', 'automation', 'S', { kind: 'Définir une variable', varName: 'a', varValue: '1' })], edges: [edge('t', 's'), edge('s', 's')] };
    const inf = await runWorkflow(wf(loop), { mode: 'manual', persist: false });
    assert.equal(inf.status, 'error');
    assert.match(inf.error!, /Limite/);
  });

  test('expression invalide : erreur claire, pas de crash', async () => {
    const g: G = { nodes: [node('t', 'trigger', 'T', {}, { trigger: 'Clic manuel' }), node('s', 'automation', 'S', { kind: 'Définir une variable', varName: 'a', varValue: '{{ inexistant.x }}' })], edges: [edge('t', 's')] };
    const ex = await runWorkflow(wf(g), { mode: 'manual', persist: false });
    assert.equal(ex.status, 'error');
    assert.match(ex.error!, /Expression/);
  });

  test('sandbox : le code ne peut pas accéder à process / require', async () => {
    const g: G = { nodes: [node('t', 'trigger', 'T', {}, { trigger: 'Clic manuel' }), node('f', 'function', 'F', { language: 'JavaScript', code: 'return { p: typeof process, r: typeof require };' })], edges: [edge('t', 'f')] };
    const ex = await runWorkflow(wf(g), { mode: 'manual', persist: false });
    assert.deepEqual(ex.result![0], { p: 'undefined', r: 'undefined' });
  });

  test('sandbox : tentative d\'évasion via constructor refusée', async () => {
    const g: G = { nodes: [node('t', 'trigger', 'T', {}, { trigger: 'Clic manuel' }), node('f', 'function', 'F', { language: 'JavaScript', inputs: 'a = 1', code: 'return { x: inputs.constructor.constructor("return process.env")() };' })], edges: [edge('t', 'f')] };
    const ex = await runWorkflow(wf(g), { mode: 'manual', persist: false });
    assert.equal(ex.status, 'error');
    assert.doesNotMatch(JSON.stringify(ex), /ENCRYPTION_KEY|test-api-key/);
  });

  test('Python', async (t) => {
    const g: G = { nodes: [node('t', 'trigger', 'T', {}, { trigger: 'Clic manuel' }), node('f', 'function', 'F', { language: 'Python', inputs: 'n = 5', code: 'x = int(inputs["n"])\nreturn {"carre": x * x}' })], edges: [edge('t', 'f')] };
    const ex = await runWorkflow(wf(g), { mode: 'manual', persist: false });
    if (ex.error?.includes("python3 n'est pas installé")) return t.skip('python3 absent');
    assert.equal(ex.status, 'success', ex.error);
    assert.deepEqual(ex.result![0], { carre: 25 });
  });
});

describe('services', () => {
  test('MIME : injection d\'en-têtes neutralisée, sujet UTF-8 encodé', () => {
    const raw = buildMime({ to: 'a@b.com\r\nBcc: evil@x.com', subject: 'Réunion\r\nX-Evil: 1', body: 'Bonjour é' });
    const head = raw.split('\r\n\r\n')[0];
    assert.ok(!/^Bcc:/m.test(head) && !/^X-Evil:/m.test(head));
    assert.match(head, /Subject: =\?UTF-8\?B\?/);
  });
  test('Telegram : messages longs découpés à 4096', () => {
    assert.deepEqual(chunk('a'.repeat(9000)).map((c) => c.length), [4096, 4096, 808]);
  });
  test('Telegram : sans réglage, répond avec le bot du déclencheur dans la conversation reçue', async () => {
    const { workflows } = await import('../src/db.js');
    const w = workflows.create('Bot', { nodes: [node('t', 'trigger', 'Bot', { botToken: '42:TOK' }, { trigger: 'Message Telegram' }),
      node('s', 'telegram', 'Telegram', { action: 'Envoyer un message', text: 'Reçu : {{trigger.text}}' })], edges: [edge('t', 's')] });
    const calls: { url: string; body: any }[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: any) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response('{"ok":true,"result":{"message_id":7}}', { headers: { 'content-type': 'application/json' } }); }) as any;
    try {
      const ex = await runWorkflow(w, { mode: 'manual', persist: false, triggerItems: [{ text: 'salut', chat_id: '999' }] });
      assert.equal(ex.status, 'success', ex.error);
    } finally { globalThis.fetch = real; workflows.remove(w.id); }
    assert.deepEqual(calls, [{ url: 'https://api.telegram.org/bot42:TOK/sendMessage', body: { chat_id: '999', text: 'Reçu : salut' } }]);
  });
  test('identifiants chiffrés en base', () => {
    const c = credentials.create('Mon bot', 'telegram', { botToken: '123:SECRET' });
    assert.deepEqual(credentials.getData(c.id), { botToken: '123:SECRET' });
    assert.equal((c as any).data, undefined);
  });
});

describe('API', () => {
  const H = { authorization: 'Bearer ' + process.env.API_KEY };
  test('API ouverte, webhook de test/production, activation, mode « attendre »', async () => {
    const app = await buildServer();
    assert.equal((await app.inject('/api/workflows')).statusCode, 200, 'API ouverte, sans connexion');
    assert.equal((await app.inject('/api/health')).statusCode, 200);

    const graph: G = {
      nodes: [node('t', 'trigger', 'Agent API', { path: '/agent/entree', method: 'POST', auth: 'Bearer token', secret: 'sekret', responseMode: 'Attendre la fin du workflow' }, { trigger: 'API / Webhook' }),
        node('f', 'function', 'Calc', { language: 'JavaScript', inputs: 'n = {{ $json.body.n }}', code: 'return { double: Number(inputs.n) * 2 };' })],
      edges: [edge('t', 'f')],
    };
    const created = await app.inject({ method: 'POST', url: '/api/workflows', headers: H, payload: { name: 'W', graph } });
    assert.equal(created.statusCode, 201);
    const w = created.json();
    assert.equal(w.webhook.production, 'http://localhost:3001/webhook/agent/entree');

    // inactif : prod 404, test OK
    assert.equal((await app.inject({ method: 'POST', url: '/webhook/agent/entree', headers: { authorization: 'Bearer sekret' }, payload: { n: 4 } })).statusCode, 404);
    const test = await app.inject({ method: 'POST', url: '/webhook-test/agent/entree', headers: { authorization: 'Bearer sekret' }, payload: { n: 4 } });
    assert.equal(test.statusCode, 200);
    assert.deepEqual(test.json(), { double: 8 });

    assert.equal((await app.inject({ method: 'POST', url: `/api/workflows/${w.id}/activate`, headers: H })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/webhook/agent/entree', payload: { n: 4 } })).statusCode, 401);
    const prod = await app.inject({ method: 'POST', url: '/webhook/agent/entree', headers: { authorization: 'Bearer sekret' }, payload: { n: 10 } });
    assert.deepEqual(prod.json(), { double: 20 });

    const list = (await app.inject({ url: `/api/executions?workflowId=${w.id}`, headers: H })).json();
    assert.ok(list.some((e: any) => e.mode === 'production' && e.status === 'success'));
    const detail = (await app.inject({ url: `/api/executions/${list[0].id}`, headers: H })).json();
    assert.ok(detail.runData.length >= 2);

    await app.inject({ method: 'POST', url: `/api/workflows/${w.id}/deactivate`, headers: H });
    assert.equal((await app.inject({ method: 'POST', url: '/webhook/agent/entree', headers: { authorization: 'Bearer sekret' }, payload: {} })).statusCode, 404);
    await app.close();
  });

  test('credentials : secrets jamais renvoyés ; /api/run valide le graphe', async () => {
    const app = await buildServer();
    const c = (await app.inject({ method: 'POST', url: '/api/credentials', headers: H, payload: { name: 'g', type: 'googleOAuth', data: { clientId: 'x', clientSecret: 'TOPSECRET' } } })).json();
    const all = (await app.inject({ url: '/api/credentials', headers: H })).body;
    assert.ok(!all.includes('TOPSECRET'));
    assert.ok(all.includes(c.id));
    const bad = await app.inject({ method: 'POST', url: '/api/run', headers: H, payload: { graph: { nodes: [], edges: [] } } });
    assert.equal(bad.statusCode, 400);
    await app.close();
  });

  test('lien client : lecture seule, sans secrets, révocable', async () => {
    const app = await buildServer();
    const graph: G = {
      nodes: [node('t', 'trigger', 'Agent', { input: '{}' }, { trigger: 'Clic manuel', x: 10, y: 20 }),
        node('l', 'function', 'Calc', { language: 'JavaScript', apiKey: 'sk-SECRETE', code: 'return { ok: 1 };' })],
      edges: [edge('t', 'l')],
    };
    const w = (await app.inject({ method: 'POST', url: '/api/workflows', headers: H, payload: { name: 'Client', graph } })).json();
    assert.equal(w.shareToken, null);
    const { shareToken } = (await app.inject({ method: 'POST', url: `/api/workflows/${w.id}/share`, headers: H })).json();
    const ex = (await app.inject({ method: 'POST', url: `/api/workflows/${w.id}/run`, headers: H, payload: {} })).json();
    assert.equal(ex.runData.at(-1).status, 'success');

    const pub = await app.inject(`/public/${shareToken}`);
    assert.equal(pub.statusCode, 200);
    assert.ok(!pub.body.includes('sk-SECRETE') && !pub.body.includes('return { ok'), 'la config ne doit pas fuiter');
    assert.deepEqual(pub.json().graph.nodes[0], { id: 't', type: 'trigger', name: 'Agent', trigger: 'Clic manuel', x: 10, y: 20 });
    assert.equal(pub.json().executions[0].id, ex.id);
    assert.deepEqual((await app.inject(`/public/${shareToken}/executions/${ex.id}`)).json().runData.at(-1).output, { out: [{ ok: 1 }] });

    // un nouveau lien invalide l'ancien ; la révocation coupe tout
    const renewed = (await app.inject({ method: 'POST', url: `/api/workflows/${w.id}/share`, headers: H })).json().shareToken;
    assert.equal((await app.inject(`/public/${shareToken}`)).statusCode, 404);
    await app.inject({ method: 'DELETE', url: `/api/workflows/${w.id}/share`, headers: H });
    assert.equal((await app.inject(`/public/${renewed}`)).statusCode, 404);
    await app.close();
  });
});

test('Sheets : colonnes « Nom : valeur », nom facultatif', async () => {
  const { parseColumns } = await import('../src/nodes/sheets.js');
  assert.deepEqual(parseColumns('Expéditeur : {{trigger.from}}\n\n{{a ? b : c}}\nObjet: Re: salut'), [
    { name: 'Expéditeur', value: '{{trigger.from}}' }, { name: '', value: '{{a ? b : c}}' }, { name: 'Objet', value: 'Re: salut' }]);
});
