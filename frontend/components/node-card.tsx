'use client';

import type { PointerEvent } from 'react';
import type { NodeRun } from '@/lib/api';
import { COLORS, PORT_COLORS, TRIGGERS, TYPE_META } from '@/lib/schema';
import type { FlowNode, Port } from '@/lib/types';
import { summary } from '@/lib/workflow';
import { IconButton } from './ui/button';
import { cx } from './ui/cx';
import { IconTile } from './ui/icon-tile';

export type RegisterPort = (key: string, el: HTMLElement | null) => void;
export const portKey = (nodeId: string, port: Port | 'in') => `${nodeId}:${port}`;

interface Props {
  node: FlowNode;
  selected: boolean;
  missing?: string[];
  /** Passage de ce bloc lors du dernier test (ou de l'exécution affichée côté client) */
  run?: NodeRun;
  /** Remplace le résumé de configuration (vue client : aperçu de la valeur produite) */
  preview?: string;
  /** Vue client : pas d'édition, ni déplacement ni liens */
  readOnly?: boolean;
  registerPort: RegisterPort;
  onHeadDown?: (e: PointerEvent, node: FlowNode) => void;
  onPortDown?: (e: PointerEvent<HTMLElement>, nodeId: string, port: Port) => void;
  onSelect: (id: string, open: boolean) => void;
}

function OutPort({ node, port, color, registerPort, onPortDown }: Pick<Props, 'node' | 'registerPort' | 'onPortDown'> & { port: Port; color: string }) {
  return (
    <div
      ref={(el) => registerPort(portKey(node.id, port), el)}
      className="port out" data-outport={port} data-nid={node.id} style={{ background: color }}
      title={onPortDown ? 'Glisser pour relier, cliquer pour ajouter un bloc' : undefined}
      onPointerDown={onPortDown && ((e) => onPortDown(e, node.id, port))}
    >+</div>
  );
}

export function NodeCard({ node, selected, missing = [], run, preview, readOnly, registerPort, onHeadDown, onPortDown, onSelect }: Props) {
  const col = COLORS[node.type];
  const icon = node.type === 'trigger' ? TRIGGERS[node.trigger!].icon : TYPE_META[node.type].icon;
  const portProps = { node, registerPort, onPortDown };
  const todo = missing.length;

  return (
    <div
      className={cx('node', selected && 'selected')} data-id={node.id}
      style={{ left: node.x, top: node.y }}
      onPointerDown={(e) => { e.stopPropagation(); onSelect(node.id, false); }}
      onDoubleClick={() => onSelect(node.id, true)}
    >
      {node.type !== 'trigger' && <div ref={(el) => registerPort(portKey(node.id, 'in'), el)} className="port in" data-inport={node.id} />}

      <div className={cx('head flex items-center gap-2.5 px-3 pt-3 pb-2', readOnly && '!cursor-pointer')} onPointerDown={onHeadDown && ((e) => onHeadDown(e, node))}>
        <IconTile icon={icon} color={col} />
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{node.name}</div>
          {node.name !== TYPE_META[node.type].label && <div className="text-xs text-faint leading-4">{TYPE_META[node.type].label}</div>}
        </div>
        {!readOnly && <IconButton icon="tune" size="sm" title="Paramétrer" onPointerDown={(e) => e.stopPropagation()} onClick={() => onSelect(node.id, true)} />}
      </div>

      <div className="px-3 pb-3">
        <p className="text-xs text-muted line-clamp-2 break-words">{preview ?? summary(node)}</p>
        <div className={cx('mt-2 flex items-center gap-1.5 text-xs', run
          ? { running: 'text-warn', error: 'text-danger', success: 'text-ok' }[run.status]
          : readOnly ? 'text-faint' : todo ? 'text-warn' : 'text-ok')}
          title={run?.error}>
          <span className={cx('w-1.5 h-1.5 rounded-full bg-current shrink-0', run?.status === 'running' && 'animate-pulse')} aria-hidden />
          <span className="truncate">
            {run ? { running: 'En cours…', error: `Erreur : ${run.error}`, success: `Exécuté en ${run.durationMs} ms` }[run.status]
              : readOnly ? 'En attente' : todo ? `${todo} champ${todo > 1 ? 's' : ''} à renseigner` : 'Configuré'}
          </span>
        </div>
      </div>

      {node.type === 'condition' ? (
        (['yes', 'no'] as const).map((p) => (
          <div key={p} className="port-row" style={{ color: PORT_COLORS[p] }}>
            {p === 'yes' ? 'Oui' : 'Non'}
            <OutPort {...portProps} port={p} color={PORT_COLORS[p]} />
          </div>
        ))
      ) : (
        <OutPort {...portProps} port="out" color="var(--color-accent)" />
      )}
    </div>
  );
}
