import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

// Nécessite un Postgres jetable : TEST_DATABASE_URL=postgres://postgres:test@localhost:55432/postgres npm test
const url = process.env.TEST_DATABASE_URL;

/** Chaque appel = un processus avec une base SQLite vide, comme un redémarrage sur Render Free */
const run = (code: string) => execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
  `import './test/setup.ts'; import fs from 'node:fs'; import path from 'node:path'; const db = await import('./src/db.ts'); const { flush, syncDir } = await import('./src/mirror.ts'); const wa = path.join(process.env.DATA_DIR, 'wa', 'pro'); ${code}; await flush(); process.exit(0);`],
{ env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' }).trim().split('\n').pop();

test('agents, identifiants, exécutions et session WhatsApp survivent à une base SQLite effacée', { skip: !url && 'TEST_DATABASE_URL absent' }, () => {
  const id = run(`const w = db.workflows.create('Persistant', { nodes: [], edges: [] }); db.workflows.setActive(w.id, true);
    const c = db.credentials.create('Google', 'googleOAuth', { clientId: 'x' }); db.credentials.update(c.id, { data: { refreshToken: 'r' } });
    const gone = db.workflows.create('Supprimé', { nodes: [], edges: [] }); db.workflows.remove(gone.id);
    db.executions.save({ id: 'ex1', workflowId: w.id, mode: 'manual', status: 'success', startedAt: 1, runData: [] });
    fs.mkdirSync(wa, { recursive: true }); fs.writeFileSync(path.join(wa, 'creds.json'), '{"me":1}'); fs.writeFileSync(path.join(wa, 'old.json'), 'x'); syncDir(wa); await flush();
    fs.rmSync(path.join(wa, 'old.json')); syncDir(wa);
    console.log(w.id + ' ' + c.id)`)!;
  const [wf, cred] = id.split(' ');
  const out = run(`console.log(JSON.stringify({ w: db.workflows.get('${wf}'), c: db.credentials.getData('${cred}'), names: db.workflows.list().map((x) => x.name),
    ex: db.executions.get('ex1')?.status, files: fs.existsSync(wa) ? fs.readdirSync(wa) : [], creds: fs.readFileSync(path.join(wa, 'creds.json'), 'utf8') }))`)!;
  const r = JSON.parse(out);
  assert.equal(r.w.name, 'Persistant');
  assert.equal(r.w.active, true);
  assert.deepEqual(r.c, { clientId: 'x', refreshToken: 'r' });
  assert.ok(!r.names.includes('Supprimé'));
  assert.equal(r.ex, 'success');
  assert.deepEqual(r.files, ['creds.json']);
  assert.equal(r.creds, '{"me":1}');
});
