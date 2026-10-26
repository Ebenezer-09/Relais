import Database from 'better-sqlite3';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { config } from './config.js';
import { decrypt, encrypt } from './crypto.js';
import { restore, sync } from './mirror.js';
import type { ExecutionRecord, Json, WorkflowGraph, WorkflowRecord } from './types.js';

export const db = new Database(process.env.DB_PATH ?? join(config.dataDir, 'synapse.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 0,
  graph TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
  data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS executions (
  id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL,
  started_at INTEGER NOT NULL, finished_at INTEGER, error TEXT, run_data TEXT NOT NULL, result TEXT
);
CREATE INDEX IF NOT EXISTS idx_exec_wf ON executions(workflow_id, started_at DESC);
CREATE TABLE IF NOT EXISTS memory (
  key TEXT PRIMARY KEY, messages TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS shares (
  token TEXT PRIMARY KEY, workflow_id TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS state (
  key TEXT PRIMARY KEY, value TEXT NOT NULL
);
`);
await restore(db, config.dataDir);

const now = () => Date.now();

/* ---------------- workflows ---------------- */
const rowToWf = (r: any): WorkflowRecord => ({
  id: r.id, name: r.name, active: !!r.active, graph: JSON.parse(r.graph),
  createdAt: r.created_at, updatedAt: r.updated_at,
});
export const workflows = {
  list: (): WorkflowRecord[] => db.prepare('SELECT * FROM workflows ORDER BY updated_at DESC').all().map(rowToWf),
  get: (id: string): WorkflowRecord | undefined => {
    const r = db.prepare('SELECT * FROM workflows WHERE id=?').get(id);
    return r ? rowToWf(r) : undefined;
  },
  create: (name: string, graph: WorkflowGraph): WorkflowRecord => {
    const id = randomUUID(), t = now();
    db.prepare('INSERT INTO workflows(id,name,active,graph,created_at,updated_at) VALUES(?,?,0,?,?,?)')
      .run(id, name, JSON.stringify(graph), t, t);
    sync('workflows', id);
    return workflows.get(id)!;
  },
  update: (id: string, patch: { name?: string; graph?: WorkflowGraph }): WorkflowRecord | undefined => {
    const cur = workflows.get(id); if (!cur) return undefined;
    db.prepare('UPDATE workflows SET name=?, graph=?, updated_at=? WHERE id=?')
      .run(patch.name ?? cur.name, JSON.stringify(patch.graph ?? cur.graph), now(), id);
    sync('workflows', id);
    return workflows.get(id);
  },
  setActive: (id: string, active: boolean) => {
    db.prepare('UPDATE workflows SET active=?, updated_at=? WHERE id=?').run(active ? 1 : 0, now(), id);
    sync('workflows', id);
  },
  remove: (id: string) => { db.prepare('DELETE FROM workflows WHERE id=?').run(id); sync('workflows', id); shares.revoke(id); },
};

/* ---------------- liens de partage client (lecture seule) ---------------- */
export const shares = {
  tokenOf: (workflowId: string): string | undefined => (db.prepare('SELECT token FROM shares WHERE workflow_id=?').get(workflowId) as any)?.token,
  workflowOf: (token: string): string | undefined => (db.prepare('SELECT workflow_id FROM shares WHERE token=?').get(token) as any)?.workflow_id,
  /** Crée le lien, ou le remplace : l'ancien cesse alors de fonctionner */
  renew: (workflowId: string): string => {
    const token = randomBytes(24).toString('base64url');
    db.prepare('INSERT INTO shares(token,workflow_id,created_at) VALUES(?,?,?) ON CONFLICT(workflow_id) DO UPDATE SET token=excluded.token, created_at=excluded.created_at').run(token, workflowId, now());
    sync('shares', workflowId);
    return token;
  },
  revoke: (workflowId: string) => { db.prepare('DELETE FROM shares WHERE workflow_id=?').run(workflowId); sync('shares', workflowId); },
};

/* ---------------- credentials (chiffrées) ---------------- */
export interface CredentialMeta { id: string; name: string; type: string; createdAt: number; updatedAt: number }
const credMeta = (r: any): CredentialMeta => ({ id: r.id, name: r.name, type: r.type, createdAt: r.created_at, updatedAt: r.updated_at });
export const credentials = {
  list: (): CredentialMeta[] => db.prepare('SELECT id,name,type,created_at,updated_at FROM credentials ORDER BY name').all().map(credMeta),
  meta: (id: string): CredentialMeta | undefined => {
    const r = db.prepare('SELECT id,name,type,created_at,updated_at FROM credentials WHERE id=?').get(id);
    return r ? credMeta(r) : undefined;
  },
  getData: (id: string): Json | undefined => {
    const r = db.prepare('SELECT data FROM credentials WHERE id=?').get(id) as any;
    return r ? JSON.parse(decrypt(r.data)) : undefined;
  },
  create: (name: string, type: string, data: Json): CredentialMeta => {
    const id = randomUUID(), t = now();
    db.prepare('INSERT INTO credentials(id,name,type,data,created_at,updated_at) VALUES(?,?,?,?,?,?)')
      .run(id, name, type, encrypt(JSON.stringify(data)), t, t);
    sync('credentials', id);
    return credentials.meta(id)!;
  },
  update: (id: string, patch: { name?: string; data?: Json }): CredentialMeta | undefined => {
    const m = credentials.meta(id); if (!m) return undefined;
    const data = patch.data ? { ...credentials.getData(id), ...patch.data } : credentials.getData(id)!;
    db.prepare('UPDATE credentials SET name=?, data=?, updated_at=? WHERE id=?')
      .run(patch.name ?? m.name, encrypt(JSON.stringify(data)), now(), id);
    sync('credentials', id);
    return credentials.meta(id);
  },
  remove: (id: string) => { db.prepare('DELETE FROM credentials WHERE id=?').run(id); sync('credentials', id); },
};

/* ---------------- exécutions ---------------- */
const rowToExec = (r: any, full = true): ExecutionRecord => ({
  id: r.id, workflowId: r.workflow_id, mode: r.mode, status: r.status,
  startedAt: r.started_at, finishedAt: r.finished_at ?? undefined, error: r.error ?? undefined,
  runData: full ? JSON.parse(r.run_data) : [], result: r.result && full ? JSON.parse(r.result) : undefined,
});
export const executions = {
  save: (e: ExecutionRecord) => {
    db.prepare(`INSERT INTO executions(id,workflow_id,mode,status,started_at,finished_at,error,run_data,result)
      VALUES(@id,@workflow_id,@mode,@status,@started_at,@finished_at,@error,@run_data,@result)
      ON CONFLICT(id) DO UPDATE SET status=@status, finished_at=@finished_at, error=@error, run_data=@run_data, result=@result`)
      .run({ id: e.id, workflow_id: e.workflowId, mode: e.mode, status: e.status, started_at: e.startedAt,
        finished_at: e.finishedAt ?? null, error: e.error ?? null, run_data: JSON.stringify(e.runData),
        result: e.result ? JSON.stringify(e.result) : null });
    sync('executions', e.id);
  },
  get: (id: string): ExecutionRecord | undefined => {
    const r = db.prepare('SELECT * FROM executions WHERE id=?').get(id);
    return r ? rowToExec(r) : undefined;
  },
  list: (workflowId?: string, limit = 50): ExecutionRecord[] => {
    const rows = workflowId
      ? db.prepare('SELECT * FROM executions WHERE workflow_id=? ORDER BY started_at DESC LIMIT ?').all(workflowId, limit)
      : db.prepare('SELECT * FROM executions ORDER BY started_at DESC LIMIT ?').all(limit);
    return rows.map((r) => rowToExec(r, false));
  },
  prune: (keep: number) => {
    const old = db.prepare('SELECT id FROM executions WHERE id NOT IN (SELECT id FROM executions ORDER BY started_at DESC LIMIT ?)').all(keep) as { id: string }[];
    db.prepare('DELETE FROM executions WHERE id NOT IN (SELECT id FROM executions ORDER BY started_at DESC LIMIT ?)').run(keep);
    for (const { id } of old) sync('executions', id);
  },
  /** Les exécutions restées "running" après un crash sont marquées en erreur au démarrage. */
  failStale: () => {
    const stale = db.prepare("SELECT id FROM executions WHERE status='running'").all() as { id: string }[];
    db.prepare("UPDATE executions SET status='error', error='Interrompue par un redémarrage', finished_at=? WHERE status='running'").run(now());
    for (const { id } of stale) sync('executions', id);
  },
};

/* ---------------- mémoire LLM, kv, état ---------------- */
export const memory = {
  get: (key: string): Json[] => {
    const r = db.prepare('SELECT messages FROM memory WHERE key=?').get(key) as any;
    return r ? JSON.parse(r.messages) : [];
  },
  set: (key: string, messages: Json[]) => {
    db.prepare('INSERT INTO memory(key,messages,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET messages=excluded.messages, updated_at=excluded.updated_at')
      .run(key, JSON.stringify(messages), now());
    sync('memory', key);
  },
};
export const kv = {
  get: (key: string): unknown => {
    const r = db.prepare('SELECT value FROM kv WHERE key=?').get(key) as any;
    return r ? JSON.parse(r.value) : null;
  },
  set: (key: string, value: unknown) => {
    db.prepare('INSERT INTO kv(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at')
      .run(key, JSON.stringify(value), now());
    sync('kv', key);
  },
};
export const state = {
  get: (key: string): string | undefined => (db.prepare('SELECT value FROM state WHERE key=?').get(key) as any)?.value,
  set: (key: string, value: string) => {
    db.prepare('INSERT INTO state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
    sync('state', key);
  },
};
