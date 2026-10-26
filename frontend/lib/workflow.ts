import { OUT_VARS, PORT_COLORS, SCHEMAS, TRIGGERS } from './schema';
import type { Config, FieldDef, Flow, FlowEdge, FlowNode, Point, Port } from './types';

export const slug = (s: string) =>
  String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'bloc';

export const nodeSlug = (n: FlowNode) => (n.type === 'trigger' ? 'trigger' : slug(n.name));

export const fieldsOf = (n: FlowNode): FieldDef[] => (n.type === 'trigger' ? TRIGGERS[n.trigger!].fields : SCHEMAS[n.type]);

export function defaultsFor(fields: FieldDef[]): Config {
  const c: Config = {};
  for (const f of fields) if (f.key) c[f.key] = f.default !== undefined ? f.default : f.type === 'toggle' ? false : '';
  return c;
}

export const visible = (f: FieldDef, c: Config) => !f.showIf || f.showIf(c);

/** Libellés des champs obligatoires encore vides */
export function missing(n: FlowNode, waConnected: boolean): string[] {
  const list: string[] = [];
  for (const f of fieldsOf(n)) {
    if (!f.required || !visible(f, n.config)) continue;
    if (f.type === 'wa-session') { if (!waConnected) list.push('Session WhatsApp'); continue; }
    if (!String(n.config[f.key!] ?? '').trim()) list.push(f.label!);
  }
  return list;
}

export function summary(n: FlowNode): string {
  const c = n.config;
  switch (n.type) {
    case 'trigger': return n.trigger!;
    case 'llm': return `${c.model || 'Modèle à choisir'} (${String(c.provider).split(' ')[0]})`;
    case 'whatsapp': case 'telegram': case 'sheets': case 'docs': return String(c.action);
    case 'mail': return c.to ? `${c.action} → ${c.to}` : String(c.action);
    case 'condition': return c.left ? `${c.left} ${c.op} ${/vide/.test(String(c.op)) ? '' : c.right || '…'}` : 'Condition à définir';
    case 'function': return String(c.language);
    case 'automation': return String(c.kind);
  }
}

/** Variables {{bloc.champ}} des blocs situés en amont de n */
export function upstreamVars(n: FlowNode, nodes: FlowNode[], edges: FlowEdge[]): string[] {
  const seen = new Set<string>(), stack = [n.id];
  while (stack.length) {
    const id = stack.pop()!;
    for (const e of edges) if (e.to === id && !seen.has(e.from)) { seen.add(e.from); stack.push(e.from); }
  }
  return [...seen].flatMap((id) => {
    const u = nodes.find((x) => x.id === id)!;
    const keys = u.type === 'trigger' ? TRIGGERS[u.trigger!].vars : OUT_VARS[u.type];
    return keys.map((k) => `{{${nodeSlug(u)}.${k}}}`);
  });
}

export function curve(a: Point, b: Point): string {
  const dx = Math.max(70, Math.abs(b.x - a.x) / 2);
  return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
}

export const portColor = (port: Port) => (port === 'out' ? '#9aa3ad' : PORT_COLORS[port]);

/** Graphe exportable ; strip retire les mots de passe et clés */
export function serialize(f: Flow, strip: boolean) {
  const nodes = f.nodes.map((n) => {
    const config = { ...n.config };
    if (strip) for (const fd of fieldsOf(n)) if (fd.type === 'password') delete config[fd.key!];
    return { ...n, config };
  });
  return { version: 1, nodes, edges: f.edges, view: f.view };
}
