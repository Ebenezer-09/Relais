import { kv } from '../db.js';
import type { NodeHandler } from '../engine/nodeTypes.js';
import { http } from '../services/http.js';
import type { Json } from '../types.js';
import { need, num, parseJsonField, sleep } from './util.js';

const MAX_WAIT_MS = 3_600_000;

export const automation: NodeHandler = {
  async run({ config: c, item, workflowId }) {
    const kind = String(c.kind || 'Requête HTTP');

    if (kind === 'Requête HTTP') {
      const url = need(String(c.url ?? '').trim(), 'URL');
      if (!/^https?:\/\//i.test(url)) throw new Error('URL invalide (http:// ou https:// requis)');
      const method = String(c.method || 'GET').toUpperCase();
      const headers = (parseJsonField(c.headers, 'En-têtes') ?? {}) as Record<string, string>;
      let body: string | undefined;
      if (c.body !== undefined && String(c.body).trim() !== '' && method !== 'GET') {
        const parsed = (() => { try { return JSON.parse(String(c.body)); } catch { return undefined; } })();
        body = parsed !== undefined ? JSON.stringify(parsed) : String(c.body);
        if (parsed !== undefined && !Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) headers['content-type'] = 'application/json';
      }
      const r = await http(url, { method, headers, body });
      if (!r.ok) throw new Error(`HTTP ${r.status} : ${(typeof r.data === 'string' ? r.data : JSON.stringify(r.data)).slice(0, 300)}`);
      return [{ json: { result: r.data, status: r.status } }];
    }

    if (kind === 'Délai') {
      const unit = String(c.unit || 'secondes');
      const ms = num(c.duration, 0) * (unit === 'heures' ? 3_600_000 : unit === 'minutes' ? 60_000 : 1000);
      if (ms > MAX_WAIT_MS) throw new Error('Délai maximum : 1 heure');
      await sleep(Math.max(0, ms));
      return [{ json: item }];
    }

    if (kind === 'Définir une variable') {
      const name = need(String(c.varName ?? '').trim(), 'Nom de la variable');
      return [{ json: { ...item, [name]: c.varValue, result: c.varValue } }];
    }

    if (kind === 'Boucle sur une liste') {
      let list: unknown = c.listExpr;
      if (typeof list === 'string') { try { list = JSON.parse(list); } catch { /* reste texte */ } }
      if (!Array.isArray(list)) throw new Error("« Liste à parcourir » doit être une liste (tableau)");
      const name = String(c.itemName || 'item');
      return list.map((v, i): { json: Json } => ({ json: { [name]: v, index: i } }));
    }

    if (kind === 'Stockage clé/valeur') {
      const key = `${workflowId}:${need(String(c.storeKey ?? '').trim(), 'Clé')}`;
      if (String(c.storeOp) === 'Lire') { const v = kv.get(key); return [{ json: { value: v, result: v } }]; }
      let v: unknown = c.storeValue;
      if (typeof v === 'string' && /^[\[{]/.test(v)) { try { v = JSON.parse(v); } catch { /* texte */ } }
      kv.set(key, v);
      return [{ json: { value: v, result: v } }];
    }
    throw new Error(`Type d'automation inconnu : ${kind}`);
  },
};
