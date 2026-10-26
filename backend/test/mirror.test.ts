import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

// Nécessite un Postgres jetable : TEST_DATABASE_URL=postgres://postgres:test@localhost:55432/postgres npm test
const url = process.env.TEST_DATABASE_URL;

/** Chaque appel = un processus avec une base SQLite vide, comme un redémarrage sur Render Free */
const run = (code: string) => execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
  `import './test/setup.ts'; const db = await import('./src/db.ts'); const { flush } = await import('./src/mirror.ts'); ${code}; await flush(); process.exit(0);`],
{ env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' }).trim().split('\n').pop();

test('les agents et identifiants survivent à une base SQLite effacée', { skip: !url && 'TEST_DATABASE_URL absent' }, () => {
  const id = run(`const w = db.workflows.create('Persistant', { nodes: [], edges: [] }); db.workflows.setActive(w.id, true);
    const c = db.credentials.create('Google', 'googleOAuth', { clientId: 'x' }); db.credentials.update(c.id, { data: { refreshToken: 'r' } });
    const gone = db.workflows.create('Supprimé', { nodes: [], edges: [] }); db.workflows.remove(gone.id); console.log(w.id + ' ' + c.id)`)!;
  const [wf, cred] = id.split(' ');
  const out = run(`console.log(JSON.stringify({ w: db.workflows.get('${wf}'), c: db.credentials.getData('${cred}'), names: db.workflows.list().map((x) => x.name) }))`)!;
  const r = JSON.parse(out);
  assert.equal(r.w.name, 'Persistant');
  assert.equal(r.w.active, true);
  assert.deepEqual(r.c, { clientId: 'x', refreshToken: 'r' });
  assert.ok(!r.names.includes('Supprimé'));
});
