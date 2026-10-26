'use client';

import { useRef } from 'react';
import { COLORS, TRIGGER_NAMES, TRIGGERS, TYPE_META } from '@/lib/schema';
import { useFlow } from '@/lib/store';
import type { TriggerName } from '@/lib/types';
import { fieldsOf, nodeSlug, upstreamVars, visible } from '@/lib/workflow';
import { FieldControl } from './field-control';
import { IconButton } from './ui/button';
import { FormField, Input, Select } from './ui/form';
import { IconTile } from './ui/icon-tile';

type TextEl = HTMLInputElement | HTMLTextAreaElement;

export function ConfigPanel() {
  const { flow, sel, panelOpen, lastRun, webhook, toast, closePanel, deleteNode, setName, setConfig, setTrigger, setWa } = useFlow();
  const bodyRef = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<TextEl | null>(null);
  const n = flow.nodes.find((x) => x.id === sel);
  const open = panelOpen && !!n;

  /** Insère une variable {{…}} à la position du curseur du dernier champ texte focalisé */
  const insertVar = (v: string) => {
    const el = lastFocus.current && document.body.contains(lastFocus.current)
      ? lastFocus.current : bodyRef.current?.querySelector<TextEl>('textarea,input[type=text]');
    if (!el || !n) return;
    const s = el.selectionStart ?? el.value.length, t = el.selectionEnd ?? s;
    const value = el.value.slice(0, s) + v + el.value.slice(t);
    if (el.dataset.field) setConfig(n.id, el.dataset.field, value);
    else if (el.dataset.scope === 'name') setName(n.id, value);
    else if (el.dataset.waField) setWa({ [el.dataset.waField]: value });
    requestAnimationFrame(() => { el.focus(); try { el.setSelectionRange(s + v.length, s + v.length); } catch { /* input number */ } });
  };

  let body = null;
  const run = n && lastRun?.runData.filter((r) => r.nodeId === n.id).at(-1);
  if (n) {
    const col = COLORS[n.type], isTrigger = n.type === 'trigger';
    const fields = fieldsOf(n).filter((f) => visible(f, n.config));
    const vars = isTrigger ? [] : upstreamVars(n, flow.nodes, flow.edges);
    const hasText = fields.some((f) => f.type === 'text' || f.type === 'textarea' || f.type === 'code');
    body = (
      <>
        <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <IconTile icon={isTrigger ? TRIGGERS[n.trigger!].icon : TYPE_META[n.type].icon} color={col} size="md" />
            <div className="min-w-0"><h2 className="font-semibold text-[15px] truncate">{n.name}</h2>{(isTrigger || n.name !== TYPE_META[n.type].label) && <p className="text-xs text-faint">{isTrigger ? "Déclencheur de l'agent" : TYPE_META[n.type].label}</p>}</div>
          </div>
          <div className="flex items-center gap-1">
            {!isTrigger && <IconButton icon="delete" tone="danger" title="Supprimer le bloc" onClick={() => deleteNode(n.id)} />}
            <IconButton icon="close" title="Fermer" onClick={closePanel} />
          </div>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-y-auto p-5 space-y-5"
          onFocus={(e) => { if (e.target.matches('textarea,input[type=text],input[type=number]')) lastFocus.current = e.target as TextEl; }}>
          <FormField label={isTrigger ? "Nom de l'agent" : 'Nom du bloc'} htmlFor="f__name"
            help={!isTrigger && <>Variable : <span className="font-mono">{`{{${nodeSlug(n)}.…}}`}</span></>}>
            <Input id="f__name" type="text" data-scope="name" value={n.name} onChange={(e) => setName(n.id, e.target.value)} />
          </FormField>
          {isTrigger && (
            <FormField label="Type de déclencheur" htmlFor="f__trigger">
              <Select id="f__trigger" options={TRIGGER_NAMES} value={n.trigger} onChange={(e) => setTrigger(n.id, e.target.value as TriggerName)} />
            </FormField>
          )}
          <div className="h-px bg-line" />

          {fields.map((f, i) => (
            <FieldControl key={f.key ?? `${f.type}-${i}`} field={f} value={f.key ? n.config[f.key] : undefined} onChange={(v) => setConfig(n.id, f.key!, v)} />
          ))}

          {isTrigger && n.trigger === 'API / Webhook' && (
            <div>
              <div className="font-medium mb-2">Adresses du webhook{webhook && <span className="ml-1.5 text-xs font-normal text-faint">{webhook.method}</span>}</div>
              {webhook ? (
                <div className="space-y-2">
                  {([["Production, quand l'agent est actif", webhook.production], ['Test, toujours disponible', webhook.test]] as const).map(([label, url]) => (
                    <div key={label}>
                      <div className="text-xs text-faint mb-1">{label}</div>
                      <button type="button" title="Copier" onClick={() => navigator.clipboard.writeText(url).then(() => toast('Adresse copiée.'))}
                        className="w-full text-left px-3 py-2 rounded-md border border-line bg-subtle font-mono text-xs break-all hover:border-line-strong">{url}</button>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-faint">Disponible une fois l&apos;agent enregistré sur le serveur.</p>}
            </div>
          )}

          {run && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">Dernier test</div>
                <span className={`text-xs ${run.status === 'error' ? 'text-danger' : 'text-ok'}`}>{run.status === 'error' ? 'Erreur' : `Réussi en ${run.durationMs} ms`}</span>
              </div>
              {run.error && <p className="mb-2 text-danger break-words">{run.error}</p>}
              <pre className="max-h-64 overflow-auto rounded-md border border-line bg-subtle p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
                {JSON.stringify(run.output && Object.keys(run.output).length === 1 ? Object.values(run.output)[0] : run.output, null, 2)}
              </pre>
            </div>
          )}

          {!isTrigger && hasText && (
            <div>
              <div className="font-medium mb-2">Variables disponibles</div>
              {vars.length ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {vars.map((v) => (
                      <button key={v} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertVar(v)}
                        className="px-2 py-1 rounded-md border border-line bg-subtle text-muted hover:border-accent hover:bg-accent-soft hover:text-accent font-mono text-xs">{v}</button>
                    ))}
                  </div>
                  <p className="text-xs text-faint mt-2">Placez le curseur dans un champ texte, puis cliquez une variable pour l&apos;insérer.</p>
                </>
              ) : (
                <p className="text-xs text-faint">Reliez ce bloc à un bloc précédent pour utiliser ses données.</p>
              )}
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <aside data-no-canvas onPointerDown={(e) => e.stopPropagation()}
      className="panel absolute top-0 right-0 bottom-0 z-30 w-[400px] max-w-full bg-surface border-l border-line shadow-[-8px_0_24px_rgba(16,24,40,.06)] flex flex-col"
      style={{ transform: open ? 'translateX(0px)' : 'translateX(110%)' }}>
      {body}
    </aside>
  );
}
