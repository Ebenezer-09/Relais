'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import type { Execution } from '@/lib/api';
import { lastRuns, previewOf } from '@/lib/format';
import { PALETTE_DESC } from '@/lib/schema';
import type { FlowEdge, FlowNode, View } from '@/lib/types';
import { EdgesLayer } from '../edges-layer';
import { fitView } from '../fit-view';
import { NodeCard } from '../node-card';
import { IconButton } from '../ui/button';
import { cx } from '../ui/cx';
import { useEdgePaths } from '../use-edge-paths';

/** Workflow en lecture seule : on peut se déplacer et zoomer, cliquer un bloc pour voir ses valeurs */
export function ClientCanvas({ nodes, edges, execution, selected, onSelect }: {
  nodes: FlowNode[]; edges: FlowEdge[]; execution?: Execution | null; selected: string | null; onSelect: (id: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const pan = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null);
  const [panning, setPanning] = useState(false);

  const getZoom = useCallback(() => viewRef.current.k, []);
  const { paths, registerPort } = useEdgePaths(nodes, edges, worldRef, getZoom, [execution]);
  const runs = lastRuns(execution);

  const fit = useCallback(() => { const v = fitView(nodes, containerRef.current!); if (v) setView(v); }, [nodes]);
  useEffect(() => {
    requestAnimationFrame(fit);
    window.addEventListener('resize', fit); // rotation du téléphone, fenêtre redimensionnée
    return () => window.removeEventListener('resize', fit);
  }, [fit]);

  const zoom = useCallback((f: number, cx?: number, cy?: number) => {
    const r = containerRef.current!.getBoundingClientRect(), v = viewRef.current;
    const k = Math.min(2, Math.max(0.3, v.k * f)), px = (cx ?? r.left + r.width / 2) - r.left, py = (cy ?? r.top + r.height / 2) - r.top;
    setView({ x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k), k });
  }, []);
  useEffect(() => {
    const c = containerRef.current!;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY); };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [zoom]);

  const onDown = (e: PointerEvent) => {
    pan.current = { sx: e.clientX, sy: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y };
    setPanning(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const p = pan.current;
    if (p) setView({ ...viewRef.current, x: p.vx + e.clientX - p.sx, y: p.vy + e.clientY - p.sy });
  };
  const onUp = (e: PointerEvent) => {
    const p = pan.current;
    pan.current = null; setPanning(false);
    if (p && Math.abs(e.clientX - p.sx) + Math.abs(e.clientY - p.sy) < 4) onSelect(null); // simple clic dans le vide
  };

  const { x, y, k } = view;
  return (
    <div ref={containerRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
      className={cx('canvas relative w-full h-full overflow-hidden bg-canvas select-none', panning && 'panning')}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle,#d3d7dc 1px,transparent 1px)', backgroundSize: `${20 * k}px ${20 * k}px`, backgroundPosition: `${x}px ${y}px` }} />
      <div ref={worldRef} className="world" style={{ transform: `translate(${x}px,${y}px) scale(${k})` }}>
        <EdgesLayer paths={paths} />
        {nodes.map((n) => {
          const run = runs.get(n.id);
          return (
            <NodeCard key={n.id} node={n} readOnly selected={selected === n.id} run={run}
              preview={previewOf(run) ?? (n.type === 'trigger' ? n.trigger : PALETTE_DESC[n.type])}
              registerPort={registerPort} onSelect={(id) => onSelect(id)} />
          );
        })}
      </div>
      <div className="absolute bottom-4 left-4 flex items-center gap-1 bg-surface border border-line p-1 rounded-lg shadow-sm" onPointerDown={(e) => e.stopPropagation()}>
        <IconButton icon="remove" title="Dézoomer" onClick={() => zoom(1 / 1.2)} />
        <IconButton icon="add" title="Zoomer" onClick={() => zoom(1.2)} />
        <IconButton icon="fit_screen" title="Ajuster la vue" onClick={fit} />
      </div>
    </div>
  );
}
