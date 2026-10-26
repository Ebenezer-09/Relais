import type Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import pg from 'pg';

/**
 * Copie de toutes les données dans Postgres (Supabase), pour survivre à un disque effacé (Render Free).
 * SQLite et les fichiers de session WhatsApp restent la source de travail (synchrone) ;
 * Postgres ne sert qu'à les restaurer au démarrage.
 */
export const MIRRORED: Record<string, string> = {
  workflows: 'id', credentials: 'id', shares: 'workflow_id', memory: 'key', kv: 'key', state: 'key', executions: 'id',
};
const FILE = 'file'; // fichiers sous DATA_DIR (session WhatsApp), clé = chemin relatif

const url = process.env.DATABASE_URL ?? '';
// Supabase présente un certificat signé par sa propre autorité : chiffré, sans vérification de la chaîne
const pool = url ? new pg.Pool({ connectionString: url, max: 3, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } }) : undefined;
let sqlite: Database.Database | undefined;
let filesRoot = '';

/* Écritures en attente, regroupées par ligne : seule la dernière version part (une exécution est réécrite à chaque bloc) */
const pending = new Map<string, { tbl: string; key: string; row: unknown }>();
let draining: Promise<void> | undefined;
function put(tbl: string, key: string, row: unknown) {
  if (!pool) return;
  pending.set(`${tbl}\u0000${key}`, { tbl, key, row });
  draining ??= drain().finally(() => { draining = undefined; });
}
async function drain() {
  while (pending.size) {
    const [id, { tbl, key, row }] = pending.entries().next().value!;
    pending.delete(id);
    try {
      await (row
        ? pool!.query('INSERT INTO relais_rows(tbl,key,row) VALUES($1,$2,$3) ON CONFLICT (tbl,key) DO UPDATE SET row=EXCLUDED.row', [tbl, key, row])
        : pool!.query('DELETE FROM relais_rows WHERE tbl=$1 AND key=$2', [tbl, key]));
    } catch (e: any) { console.error(`[mirror] ${tbl}/${key} non copiée dans Postgres : ${e.message}`); }
  }
}

/** Charge Postgres dans SQLite et DATA_DIR (Postgres fait foi). À appeler avant toute lecture. */
export async function restore(db: Database.Database, root: string): Promise<void> {
  sqlite = db; filesRoot = root;
  if (!pool) return;
  await pool.query('CREATE TABLE IF NOT EXISTS relais_rows (tbl TEXT NOT NULL, key TEXT NOT NULL, row JSONB NOT NULL, PRIMARY KEY (tbl, key))');
  // Supabase expose le schéma public via son API : RLS sans politique = invisible pour anon/authenticated
  await pool.query('ALTER TABLE relais_rows ENABLE ROW LEVEL SECURITY');
  const { rows } = await pool.query<{ tbl: string; key: string; row: Record<string, any> }>('SELECT tbl, key, row FROM relais_rows');
  db.transaction(() => {
    for (const { tbl, row } of rows) {
      if (!(tbl in MIRRORED)) continue;
      const cols = Object.keys(row);
      db.prepare(`INSERT OR REPLACE INTO ${tbl}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`).run(...cols.map((c) => row[c]));
    }
  })();
  for (const { tbl, key, row } of rows) {
    if (tbl !== FILE || key.includes('..')) continue;
    const p = join(root, key);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, Buffer.from(row.b64, 'base64'));
    copied.set(key, statSync(p).mtimeMs);
  }
  console.log(`[mirror] ${rows.length} éléments restaurés depuis Postgres`);
}

/** Recopie la ligne (ou sa suppression) dans Postgres */
export function sync(tbl: string, key: string): void {
  if (!pool || !sqlite) return;
  put(tbl, key, sqlite.prepare(`SELECT * FROM ${tbl} WHERE ${MIRRORED[tbl]}=?`).get(key));
}

/* ---------- dossiers de fichiers (session WhatsApp) ---------- */
const copied = new Map<string, number>(); // chemin relatif -> mtime déjà copié
const timers = new Map<string, NodeJS.Timeout>();

/** Recopie un dossier (fichiers ajoutés, modifiés ou supprimés), 2 s après sa dernière modification */
export function syncDir(dir: string): void {
  if (!pool) return;
  clearTimeout(timers.get(dir));
  timers.set(dir, setTimeout(() => copyDir(dir), 2000));
}
function copyDir(dir: string) {
  timers.delete(dir);
  const prefix = relative(filesRoot, dir) + '/';
  const present = new Set<string>();
  for (const f of existsSync(dir) ? readdirSync(dir) : []) {
    const key = prefix + f, p = join(dir, f), m = statSync(p).mtimeMs;
    present.add(key);
    if (copied.get(key) === m) continue;
    copied.set(key, m);
    put(FILE, key, { b64: readFileSync(p).toString('base64') });
  }
  for (const key of copied.keys()) if (key.startsWith(prefix) && !present.has(key)) { copied.delete(key); put(FILE, key, undefined); }
}

/** Envoie tout ce qui est en attente (arrêt du serveur, tests) */
export async function flush(): Promise<void> {
  for (const dir of [...timers.keys()]) { clearTimeout(timers.get(dir)); copyDir(dir); }
  while (draining) await draining;
}
