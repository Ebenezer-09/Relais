'use client';

import { useCallback, useEffect, useState } from 'react';
import { publicApi, type Execution, type ExecutionSummary, type SharedAgent } from '@/lib/api';
import { Logo } from '../ui/logo';
import { ActivityList } from './activity-list';
import { ClientCanvas } from './client-canvas';
import { NodeDetail } from './node-detail';

const summarize = ({ runData: _r, result: _res, ...s }: Execution): ExecutionSummary => s;

/** Page livrée au client : son agent, chaque exécution en direct et les valeurs produites à chaque étape */
export function ClientView({ token }: { token: string }) {
  const [agent, setAgent] = useState<SharedAgent | null>(null);
  const [error, setError] = useState('');
  const [executions, setExecutions] = useState<ExecutionSummary[]>([]);
  const [details, setDetails] = useState<Record<string, Execution>>({});
  const [pinned, setPinned] = useState<string | null>(null); // null = suivre la plus récente
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const load = useCallback((id: string) => {
    publicApi.execution(token, id).then((ex) => setDetails((d) => ({ ...d, [ex.id]: ex }))).catch(() => {});
  }, [token]);

  useEffect(() => {
    publicApi.agent(token).then((a) => {
      setAgent(a); setExecutions(a.executions);
      if (a.executions[0]) load(a.executions[0].id);
    }).catch((e) => setError(e.message));
    return publicApi.events(token, (ex) => {
      setDetails((d) => ({ ...d, [ex.id]: ex }));
      setExecutions((list) => [summarize(ex), ...list.filter((e) => e.id !== ex.id)].sort((a, b) => b.startedAt - a.startedAt).slice(0, 50));
    });
  }, [token, load]);

  const shownId = pinned ?? executions[0]?.id;
  const shown = shownId ? details[shownId] : null;
  const pick = (id: string) => { setPinned(id === executions[0]?.id ? null : id); if (!details[id]) load(id); };

  if (error) {
    return (
      <main className="min-h-dvh flex items-center justify-center p-6 text-center">
        <div className="max-w-sm"><Logo size={40} className="mx-auto mb-4" /><h1 className="text-lg font-semibold">Ce lien ne fonctionne pas</h1>
          <p className="mt-2 text-muted">{error}. Demandez un nouveau lien à la personne qui a configuré votre agent.</p></div>
      </main>
    );
  }
  if (!agent) return <main className="min-h-dvh flex items-center justify-center text-muted">Chargement…</main>;

  const node = agent.graph.nodes.find((n) => n.id === selectedNode);
  return (
    <div className="h-dvh flex flex-col">
      <header className="h-14 shrink-0 px-4 sm:px-5 flex items-center justify-between gap-3 bg-surface border-b border-line">
        <div className="flex items-center gap-2.5 min-w-0">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight max-sm:hidden">Relais</span>
          <span className="text-line-strong max-sm:hidden" aria-hidden>/</span>
          <span className="font-medium truncate">{agent.name}</span>
        </div>
        <span className={`flex items-center gap-1.5 text-xs shrink-0 ${agent.active ? 'text-ok' : 'text-faint'}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" />{agent.active ? 'Agent en service' : 'Agent en pause'}
        </span>
      </header>
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <div className="h-[55dvh] md:h-auto md:flex-1 min-w-0">
          <ClientCanvas nodes={agent.graph.nodes} edges={agent.graph.edges} execution={shown} selected={selectedNode} onSelect={setSelectedNode} />
        </div>
        <aside className="flex-1 md:flex-none md:w-[380px] min-h-0 flex flex-col bg-surface border-t md:border-t-0 md:border-l border-line">
          {node
            ? <NodeDetail node={node} execution={shown} onClose={() => setSelectedNode(null)} />
            : <ActivityList executions={executions} shownId={shownId} live={pinned === null} onLive={() => setPinned(null)} onPick={pick} />}
        </aside>
      </div>
    </div>
  );
}
