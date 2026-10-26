import type Database from 'better-sqlite3';
import pg from 'pg';

/**
 * Copie des tables durables dans Postgres (Supabase), pour survivre à un disque effacé (Render Free).
 * SQLite reste la base de travail (synchrone) ; Postgres ne sert qu'à la restaurer au démarrage.
 * Les exécutions ne sont pas copiées : historique volumineux, perdu sans conséquence.
 */
export const MIRRORED: Record<string, string> = {
  workflows: 'id', credentials: 'id', shares: 'workflow_id', memory: 'key', kv: 'key', state: 'key',
};

const url = process.env.DATABASE_URL ?? '';
// Supabase présente un certificat signé par sa propre autorité : chiffré, sans vérification de la chaîne
const pool = url ? new pg.Pool({ connectionString: url, max: 3, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } }) : undefined;
let sqlite: Database.Database | undefined;
let queue: Promise<unknown> = Promise.resolve();

/** Charge Postgres dans SQLite (Postgres fait foi). À appeler avant toute lecture. */
export async function restore(db: Database.Database): Promise<void> {
  sqlite = db;
  if (!pool) return;
  await pool.query('CREATE TABLE IF NOT EXISTS relais_rows (tbl TEXT NOT NULL, key TEXT NOT NULL, row JSONB NOT NULL, PRIMARY KEY (tbl, key))');
  const { rows } = await pool.query<{ tbl: string; row: Record<string, unknown> }>('SELECT tbl, row FROM relais_rows');
  db.transaction(() => {
    for (const { tbl, row } of rows) {
      if (!(tbl in MIRRORED)) continue;
      const cols = Object.keys(row);
      db.prepare(`INSERT OR REPLACE INTO ${tbl}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`).run(...cols.map((c) => row[c]));
    }
  })();
  console.log(`[mirror] ${rows.length} lignes restaurées depuis Postgres`);
}

/** Recopie la ligne (ou sa suppression) dans Postgres, dans l'ordre des écritures */
export function sync(tbl: string, key: string): void {
  if (!pool || !sqlite) return;
  const row = sqlite.prepare(`SELECT * FROM ${tbl} WHERE ${MIRRORED[tbl]}=?`).get(key);
  queue = queue.then(() => row
    ? pool.query('INSERT INTO relais_rows(tbl,key,row) VALUES($1,$2,$3) ON CONFLICT (tbl,key) DO UPDATE SET row=EXCLUDED.row', [tbl, key, row])
    : pool.query('DELETE FROM relais_rows WHERE tbl=$1 AND key=$2', [tbl, key]),
  ).catch((e) => console.error(`[mirror] ${tbl}/${key} non copiée dans Postgres : ${e.message}`));
}

/** Attend la fin des copies en cours (arrêt propre, tests) */
export const flush = () => queue;
