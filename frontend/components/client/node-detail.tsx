import type { Execution } from '@/lib/api';
import { fmtDuration } from '@/lib/format';
import { COLORS, TRIGGERS, TYPE_META } from '@/lib/schema';
import type { FlowNode } from '@/lib/types';
import { IconButton } from '../ui/button';
import { IconTile } from '../ui/icon-tile';

const Json = ({ value }: { value: unknown }) => (
  <pre className="max-h-72 overflow-auto rounded-md border border-line bg-subtle p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
    {JSON.stringify(value, null, 2)}
  </pre>
);

/** Ce qu'un bloc a reçu et produit lors de l'exécution affichée */
export function NodeDetail({ node, execution, onClose }: { node: FlowNode; execution?: Execution | null; onClose: () => void }) {
  const runs = execution?.runData.filter((r) => r.nodeId === node.id) ?? [];
  const run = runs.at(-1);
  const output = run && Object.keys(run.output).length === 1 ? Object.values(run.output)[0] : run?.output;
  return (
    <div className="flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <IconTile icon={node.type === 'trigger' ? TRIGGERS[node.trigger!].icon : TYPE_META[node.type].icon} color={COLORS[node.type]} />
          <div className="min-w-0"><h2 className="font-semibold truncate">{node.name}</h2>{node.name !== TYPE_META[node.type].label && <p className="text-xs text-faint">{TYPE_META[node.type].label}</p>}</div>
        </div>
        <IconButton icon="close" title="Revenir à l'activité" onClick={onClose} />
      </div>
      <div className="overflow-y-auto p-4 space-y-5">
        {!run ? (
          <p className="text-muted">Ce bloc n&apos;a pas été exécuté lors de cette exécution.</p>
        ) : (
          <>
            <p className={run.status === 'error' ? 'text-danger' : run.status === 'running' ? 'text-warn' : 'text-ok'}>
              {run.status === 'running' ? 'En cours…' : run.status === 'error' ? `Erreur : ${run.error}` : `Exécuté en ${fmtDuration(run.durationMs)}`}
              {runs.length > 1 && <span className="text-faint">{` (${runs.length} passages, le dernier est affiché)`}</span>}
            </p>
            <div><div className="font-medium mb-2">Données reçues</div><Json value={run.input.length === 1 ? run.input[0] : run.input} /></div>
            {run.status === 'success' && <div><div className="font-medium mb-2">Données produites</div><Json value={output} /></div>}
          </>
        )}
      </div>
    </div>
  );
}
