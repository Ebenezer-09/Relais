import type { Execution, NodeRun } from './api';

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** 14:32:05 aujourd'hui, sinon 12/10 14:32 */
export function fmtTime(ms: number): string {
  const d = new Date(ms);
  return sameDay(d, new Date())
    ? d.toLocaleTimeString('fr-FR')
    : `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

export function fmtDuration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1).replace('.', ',')} s` : `${Math.round(ms / 60_000)} min`;
}

export const execDuration = (e: Pick<Execution, 'startedAt' | 'finishedAt'>) => (e.finishedAt ? e.finishedAt - e.startedAt : Date.now() - e.startedAt);

/** Aperçu court de la valeur produite par un bloc */
export function previewOf(run?: NodeRun): string | undefined {
  if (!run || run.status !== 'success') return undefined;
  const o = run.output;
  if ('yes' in o || 'no' in o) return o.yes?.length ? 'Branche « Oui »' : 'Branche « Non »';
  const first = Object.values(o)[0]?.[0] as Record<string, any> | undefined;
  if (first == null) return 'Aucune donnée produite';
  const text = typeof first.text === 'string' ? first.text : typeof first.body?.text === 'string' ? first.body.text : JSON.stringify(first);
  return text.length > 140 ? text.slice(0, 140) + '…' : text;
}

/** Dernier passage de chaque bloc (un bloc peut tourner plusieurs fois dans une boucle) */
export const lastRuns = (ex?: Execution | null) => new Map(ex?.runData.map((r) => [r.nodeId, r]));
