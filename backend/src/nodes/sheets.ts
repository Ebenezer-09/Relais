import type { NodeHandler } from '../engine/nodeTypes.js';
import { google, googleFileId } from '../services/google.js';
import { need } from './util.js';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';

export const sheets: NodeHandler = {
  async run({ config: c }) {
    const credId = need(String(c.credentialId ?? ''), 'Compte Google');
    const id = googleFileId(need(String(c.spreadsheet ?? ''), 'Feuille de calcul'));
    const tab = String(c.sheet ?? '').trim();
    const range = (r: string) => encodeURIComponent(tab ? `'${tab.replace(/'/g, "''")}'!${r}` : r);
    if (String(c.action || '').startsWith('Lire')) {
      const d = await google('Google Sheets', credId, `${API}/${id}/values/${range('A:ZZ')}`);
      const [head = [], ...rest] = (d.values ?? []) as string[][];
      // chaque ligne devient un objet { colonne: valeur } d'après la ligne d'en-tête
      const rows = rest.map((r) => Object.fromEntries(head.map((h, i) => [h || `col${i + 1}`, r[i] ?? ''])));
      return [{ json: { rows, count: rows.length } }];
    }
    const cells = String(c.values ?? '').split('\n');
    const d = await google('Google Sheets', credId, `${API}/${id}/values/${range('A1')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, 'POST', { values: [cells] });
    return [{ json: { status: 'added', range: d.updates?.updatedRange ?? '' } }];
  },
};
