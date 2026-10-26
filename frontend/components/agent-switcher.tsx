'use client';

import { useEffect, useRef, useState } from 'react';
import { api, type WorkflowRecord } from '@/lib/api';
import { useFlow } from '@/lib/store';
import { cx } from './ui/cx';
import { Icon } from './ui/icon';

/** Nom de l'agent ouvert (renommable au crayon) ; un clic liste les agents enregistrés sur le serveur */
export function AgentSwitcher({ name }: { name: string }) {
  const { connOk, workflowId, openAgent, toast, flow, setName } = useFlow();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [list, setList] = useState<WorkflowRecord[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setList(null);
    api.workflows.list().then(setList).catch((e) => { toast(e.message); setOpen(false); });
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open, toast]);

  // le nom de l'agent est celui de son bloc déclencheur
  const rename = (v: string) => { const t = flow.nodes.find((n) => n.type === 'trigger'); if (t && v.trim()) setName(t.id, v.trim()); setEditing(false); };
  if (editing) {
    return (
      <input autoFocus aria-label="Nom de l'agent" defaultValue={name} onFocus={(e) => e.target.select()}
        onBlur={(e) => rename(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = name; e.currentTarget.blur(); } }}
        className="w-56 h-8 px-2 rounded-md border border-accent bg-surface focus:outline-none focus:ring-3 focus:ring-accent-soft" />
    );
  }
  const pencil = (
    <button type="button" title="Renommer l'agent" aria-label="Renommer l'agent" onClick={() => setEditing(true)}
      className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-faint hover:text-ink hover:bg-subtle"><Icon name="edit" size={16} /></button>
  );
  if (!connOk) return <span className="flex items-center gap-0.5 min-w-0"><span className="text-muted truncate">{name}</span>{pencil}</span>;
  return (
    <div ref={ref} className="relative min-w-0 flex items-center gap-0.5">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 max-w-64 px-1.5 h-8 rounded-md text-muted hover:text-ink hover:bg-subtle">
        <span className="truncate">{name}</span><Icon name="unfold_more" size={16} />
      </button>
      {pencil}
      {open && (
        <div role="menu" className="absolute left-0 top-10 z-50 w-72 bg-surface border border-line rounded-lg shadow-lg p-1.5 max-h-96 overflow-y-auto">
          <div className="px-2 pt-1.5 pb-1 text-xs font-medium text-faint">Vos agents</div>
          {list === null && <div className="px-2 py-2 text-muted">Chargement…</div>}
          {list?.length === 0 && <div className="px-2 py-2 text-muted">Aucun agent enregistré.</div>}
          {list?.map((wf) => (
            <button key={wf.id} type="button" role="menuitem" onClick={() => { setOpen(false); if (wf.id !== workflowId) openAgent(wf.id); }}
              className={cx('w-full flex items-center justify-between gap-3 px-2 py-2 rounded-md text-left hover:bg-subtle', wf.id === workflowId && 'bg-subtle')}>
              <span className="truncate font-medium">{wf.name}</span>
              <span className={cx('flex items-center gap-1.5 text-xs shrink-0', wf.active ? 'text-ok' : 'text-faint')}>
                <span className="w-1.5 h-1.5 rounded-full bg-current" />{wf.active ? 'Actif' : 'Inactif'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
