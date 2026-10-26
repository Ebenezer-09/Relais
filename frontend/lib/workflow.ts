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

/** {{bloc.champ}} → «Donnée», pour les résumés sur les cartes */
const plain = (v: unknown) => String(v).replace(/\{\{\s*\w+\.(\w+)\s*\}\}/g, (_, k) => `«${VAR_LABELS[k] ?? k}»`);

export function summary(n: FlowNode): string {
  const c = n.config;
  switch (n.type) {
    case 'trigger': return n.trigger!;
    case 'llm': return `${c.model || 'Modèle à choisir'} (${String(c.provider).split(' ')[0]})`;
    case 'whatsapp': case 'telegram': case 'sheets': case 'docs': return String(c.action);
    case 'mail': return c.to ? `${c.action} → ${plain(c.to)}` : String(c.action);
    case 'condition': return c.left ? `${plain(c.left)} ${c.op} ${/vide/.test(String(c.op)) ? '' : c.right || '…'}` : 'Condition à définir';
    case 'function': return String(c.language);
    case 'automation': return String(c.kind);
  }
}

/** Nom lisible de chaque donnée produite par un bloc */
const VAR_LABELS: Record<string, string> = {
  text: 'Texte', from: 'Expéditeur', name: 'Nom', subject: 'Objet', body: 'Contenu', chat_id: 'Conversation', username: 'Utilisateur',
  query: 'Paramètres', headers: 'En-têtes', date: 'Date', input: 'Données', json: 'JSON', message_id: 'N° du message',
  status: 'Statut', rows: 'Lignes', count: 'Nombre', document_id: 'N° du document', url: 'Lien', result: 'Résultat',
};
const varLabel = (type: string, k: string) => (type === 'llm' && k === 'text' ? 'Réponse' : VAR_LABELS[k] ?? k);

export interface Var { value: string; label: string }

/** Affiche « Bloc › Donnée » à la place de {{bloc.champ}} */
export const showVars = (s: string, vars: Var[]) => vars.reduce((t, v) => t.split(v.value).join(`«${v.label}»`), s);
export const hideVars = (s: string, vars: Var[]) => vars.reduce((t, v) => t.split(`«${v.label}»`).join(v.value), s);

/** Données {{bloc.champ}} des blocs situés en amont de n */
export function upstreamVars(n: FlowNode, nodes: FlowNode[], edges: FlowEdge[]): Var[] {
  const seen = new Set<string>(), stack = [n.id];
  while (stack.length) {
    const id = stack.pop()!;
    for (const e of edges) if (e.to === id && !seen.has(e.from)) { seen.add(e.from); stack.push(e.from); }
  }
  return [...seen].flatMap((id) => {
    const u = nodes.find((x) => x.id === id)!;
    const keys = u.type === 'trigger' ? TRIGGERS[u.trigger!].vars : OUT_VARS[u.type];
    const title = u.type === 'trigger' ? u.trigger! : u.name;
    return keys.map((k) => ({ value: `{{${nodeSlug(u)}.${k}}}`, label: `${title} › ${varLabel(u.type, k)}` }));
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
