import { kv, workflows } from '../db.js';
import type { NodeHandler } from '../engine/nodeTypes.js';
import { google, googleFileId } from '../services/google.js';
import { need } from './util.js';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';

/** « Nom : valeur » par ligne ; le nom est facultatif (le texte avant « : » ne doit pas contenir de {{…}}) */
export function parseColumns(raw: string): { name: string; value: string }[] {
  return raw.split('\n').filter((l) => l.trim()).map((l) => {
    const i = l.indexOf(':');
    return i > 0 && !l.slice(0, i).includes('{{') ? { name: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : { name: '', value: l.trim() };
  });
}

// une seule création à la fois par agent, même si plusieurs exécutions arrivent ensemble
const creating = new Map<string, Promise<string>>();

/** Feuille collée dans le bloc, sinon celle créée automatiquement pour l'agent (gardée dans kv) */
function spreadsheetFor(credId: string, workflowId: string, pasted: string): Promise<string> {
  if (pasted) return Promise.resolve(googleFileId(pasted));
  const key = `sheet:${workflowId}`;
  const known = kv.get(key);
  if (known) return Promise.resolve(String(known));
  if (!creating.has(key)) {
    const title = `Relais – ${workflows.get(workflowId)?.name ?? 'agent'}`;
    creating.set(key, google('Google Sheets', credId, API, 'POST', { properties: { title } })
      .then((d) => { kv.set(key, d.spreadsheetId); return String(d.spreadsheetId); })
      .finally(() => creating.delete(key)));
  }
  return creating.get(key)!;
}

export const sheets: NodeHandler = {
  // chaque ligne est évaluée séparément : une réponse sur plusieurs lignes reste dans une seule cellule
  noResolve: ['values'],
  async run({ config: c, workflowId, resolve }) {
    const credId = need(String(c.credentialId ?? ''), 'Compte Google');
    const id = await spreadsheetFor(credId, workflowId, String(c.spreadsheet ?? '').trim());
    const url = `https://docs.google.com/spreadsheets/d/${id}/edit`;
    const tab = String(c.sheet ?? '').trim();
    const range = (r: string) => encodeURIComponent(tab ? `'${tab.replace(/'/g, "''")}'!${r}` : r);
    if (String(c.action || '').startsWith('Lire')) {
      const d = await google('Google Sheets', credId, `${API}/${id}/values/${range('A:ZZ')}`);
      const [head = [], ...rest] = (d.values ?? []) as string[][];
      // chaque ligne devient un objet { colonne: valeur } d'après la ligne d'en-tête
      const rows = rest.map((r) => Object.fromEntries(head.map((h, i) => [h || `col${i + 1}`, r[i] ?? ''])));
      return [{ json: { rows, count: rows.length, url } }];
    }
    const cols = parseColumns(String(c.values ?? ''));
    if (!cols.length) throw new Error('Colonnes à remplir manquantes');
    const rows = [cols.map((x) => { const v = resolve(x.value); return v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); })];
    // feuille vide : on écrit d'abord la ligne de titres
    if (cols.some((x) => x.name) && !(await google('Google Sheets', credId, `${API}/${id}/values/${range('1:1')}`)).values?.length) rows.unshift(cols.map((x) => x.name));
    const d = await google('Google Sheets', credId, `${API}/${id}/values/${range('A1')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, 'POST', { values: rows });
    return [{ json: { status: 'added', range: d.updates?.updatedRange ?? '', url } }];
  },
};
