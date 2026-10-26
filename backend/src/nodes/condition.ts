import type { NodeHandler } from '../engine/nodeTypes.js';
import { need } from './util.js';

export function test(op: string, left: unknown, right: unknown, caseSensitive: boolean): boolean {
  const norm = (v: unknown) => { const s = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? ''); return caseSensitive ? s : s.toLowerCase(); };
  const l = norm(left), r = norm(right);
  switch (op) {
    case 'contient': return l.includes(r);
    case 'ne contient pas': return !l.includes(r);
    case 'est égal à': return l === r;
    case 'est différent de': return l !== r;
    case 'commence par': return l.startsWith(r);
    case 'correspond à la regex': {
      try { return new RegExp(String(right), caseSensitive ? '' : 'i').test(String(left ?? '')); }
      catch { throw new Error(`Regex invalide : ${right}`); }
    }
    case 'est vide': return l.trim() === '';
    case "n'est pas vide": return l.trim() !== '';
    case 'est supérieur à': case 'est inférieur à': {
      const a = Number(left), b = Number(right);
      if (Number.isNaN(a) || Number.isNaN(b)) throw new Error('Comparaison numérique impossible : valeurs non numériques');
      return op === 'est supérieur à' ? a > b : a < b;
    }
    default: throw new Error(`Opérateur inconnu : ${op}`);
  }
}

export const condition: NodeHandler = {
  async run({ config: c, item }) {
    const op = need(String(c.op ?? ''), 'Opérateur');
    const ok = test(op, c.left, c.right, c.caseSensitive === true || c.caseSensitive === 'true');
    return [{ json: item, port: ok ? 'yes' : 'no' }];
  },
};
