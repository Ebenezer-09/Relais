'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { NODE_W } from '@/lib/schema';
import { useFlow } from '@/lib/store';
import type { BlockType, FlowNode, PaletteCtx, Point, Port } from '@/lib/types';
import { cx } from './ui/cx';
import { curve, missing } from '@/lib/workflow';
import { ConfigPanel } from './config-panel';
import { EdgesLayer } from './edges-layer';
import { fitView } from './fit-view';
import { EmptyState } from './empty-state';
import { Hud } from './hud';
import { NodeCard } from './node-card';
import { useEdgePaths } from './use-edge-paths';
import { Palette } from './palette';

type Drag =
  | { type: 'pan'; vx: number; vy: number; sx: number; sy: number; moved: boolean }
  | { type: 'node'; id: string; ox: number; oy: number; sx: number; sy: number; moved: boolean }
  | { type: 'conn'; from: string; port: Port; el: HTMLElement; sx: number; sy: number; moved: boolean };

export function Canvas() {
  const { flow, loaded, sel, panelOpen, wa, lastRun, getFlow, setView, select, moveNode, addEdge, removeEdge, addNode, deleteNode, toast } = useFlow();
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [tmp, setTmp] = useState<string | null>(null);
  const [palette, setPalette] = useState<PaletteCtx | null>(null);
  const [panning, setPanning] = useState(false);

  const getZoom = useCallback(() => getFlow().view.k, [getFlow]);
  const { paths, registerPort, portCenter } = useEdgePaths(flow.nodes, flow.edges, worldRef, getZoom, [wa.status, lastRun]);

  /* ---------- coordonnées ---------- */
  const toWorld = useCallback((cx: number, cy: number): Point => {
    const r = containerRef.current!.getBoundingClientRect(), v = getFlow().view;
    return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k };
  }, [getFlow]);

  /* ---------- zoom ---------- */
  const zoomAt = useCallback((f: number, cx?: number, cy?: number) => {
    const r = containerRef.current!.getBoundingClientRect(), v = getFlow().view;
    const k = Math.min(2, Math.max(0.3, v.k * f)), px = (cx ?? r.left + r.width / 2) - r.left, py = (cy ?? r.top + r.height / 2) - r.top;
    setView({ x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k), k });
  }, [getFlow, setView]);

  const fit = () => {
    const v = fitView(getFlow().nodes, containerRef.current!, panelOpen ? 400 : 0);
    if (v) setView(v);
  };

  useEffect(() => {
    const c = containerRef.current!;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as Element).closest('[data-no-canvas]')) return;
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  /* ---------- glisser : panoramique, déplacement de bloc, création de lien ---------- */
  const onCanvasDown = (e: PointerEvent) => {
    const v = getFlow().view;
    setPalette(null);
    drag.current = { type: 'pan', vx: v.x, vy: v.y, sx: e.clientX, sy: e.clientY, moved: false };
    setPanning(true);
  };
  const onHeadDown = (e: PointerEvent, n: FlowNode) => {
    e.stopPropagation();
    drag.current = { type: 'node', id: n.id, ox: n.x, oy: n.y, sx: e.clientX, sy: e.clientY, moved: false };
    select(n.id);
  };
  const onPortDown = (e: PointerEvent<HTMLElement>, from: string, port: Port) => {
    e.preventDefault(); e.stopPropagation();
    drag.current = { type: 'conn', from, port, el: e.currentTarget, sx: e.clientX, sy: e.clientY, moved: false };
  };

  useEffect(() => {
    const move = (e: globalThis.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
      const v = getFlow().view;
      if (d.type === 'pan') setView({ ...v, x: d.vx + dx, y: d.vy + dy });
      else if (d.type === 'node') moveNode(d.id, d.ox + dx / v.k, d.oy + dy / v.k);
      else if (d.moved) setTmp(curve(portCenter(d.el), toWorld(e.clientX, e.clientY)));
    };
    const up = (e: globalThis.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      drag.current = null; setPanning(false);
      if (d.type !== 'conn') return;
      setTmp(null);
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const nodeEl = under?.closest<HTMLElement>('[data-id]');
      const target = under?.closest<HTMLElement>('[data-inport]')?.dataset.inport
        ?? (nodeEl && getFlow().nodes.find((n) => n.id === nodeEl.dataset.id)?.type !== 'trigger' ? nodeEl.dataset.id : undefined);
      if (d.moved && target) addEdge(d.from, d.port, target);
      else setPalette({ from: d.from, port: d.port, screen: { x: e.clientX, y: e.clientY }, world: d.moved ? toWorld(e.clientX, e.clientY) : null });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [getFlow, setView, moveNode, addEdge, portCenter, toWorld]);

  /* ---------- clavier et fermeture de la palette ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPalette(null);
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel && !(e.target as Element).matches('input,textarea,select')) deleteNode(sel);
    };
    const onDown = (e: globalThis.PointerEvent) => {
      if (!(e.target as Element).closest('[data-palette],[data-add-block],[data-outport]')) setPalette(null);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown, true); };
  }, [sel, deleteNode]);

  /* ---------- palette ---------- */
  const onAddBlock = (e: MouseEvent<HTMLButtonElement>) => {
    if (!flow.nodes.length) { toast("Créez d'abord un agent avec son déclencheur."); return; }
    const s = flow.nodes.find((n) => n.id === sel), r = e.currentTarget.getBoundingClientRect();
    setPalette({ from: s?.id ?? null, port: s?.type === 'condition' ? 'yes' : 'out', screen: { x: r.left, y: r.top - 340 } });
  };
  const onPick = (type: BlockType) => {
    const ctx = palette!;
    setPalette(null);
    const src = ctx.from ? flow.nodes.find((n) => n.id === ctx.from) : undefined;
    let p: Point;
    if (ctx.world) p = { x: ctx.world.x - NODE_W / 2, y: ctx.world.y - 20 };
    else if (src) {
      const siblings = flow.edges.filter((e) => e.from === src.id).length;
      p = { x: src.x + NODE_W + 110, y: src.y + siblings * 190 + (ctx.port === 'no' ? 190 : 0) };
    } else {
      const c = containerRef.current!, r = c.getBoundingClientRect();
      p = toWorld(r.left + c.clientWidth / 2 - 150, r.top + c.clientHeight / 2 - 60);
    }
    addNode(type, p.x, p.y, src ? { from: src.id, port: ctx.port } : undefined);
  };

  const { x, y, k } = flow.view;
  const waConnected = wa.status === 'connected';
  // un bloc peut tourner plusieurs fois (boucle) : on garde son dernier passage
  const runs = new Map(lastRun?.runData.map((r) => [r.nodeId, r]));
  return (
    <div ref={containerRef} onPointerDown={onCanvasDown}
      className={cx('canvas relative w-full h-[calc(100dvh-3.5rem)] overflow-hidden bg-canvas select-none', panning && 'panning')}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle,#d3d7dc 1px,transparent 1px)', backgroundSize: `${20 * k}px ${20 * k}px`, backgroundPosition: `${x}px ${y}px` }} />
      <div ref={worldRef} className="world" style={{ transform: `translate(${x}px,${y}px) scale(${k})` }}>
        <EdgesLayer paths={paths} tmp={tmp} onDelete={removeEdge} />
        <div>
          {flow.nodes.map((n) => (
            <NodeCard key={n.id} node={n} selected={sel === n.id} missing={missing(n, waConnected)} run={runs.get(n.id)}
              registerPort={registerPort} onHeadDown={onHeadDown} onPortDown={onPortDown} onSelect={select} />
          ))}
        </div>
      </div>

      {loaded && !flow.nodes.length && <EmptyState />}
      <Hud zoom={k} onZoomIn={() => zoomAt(1.2)} onZoomOut={() => zoomAt(1 / 1.2)} onFit={fit} onAddBlock={onAddBlock} />
      {palette && <Palette ctx={palette} containerRef={containerRef} onPick={onPick} />}
      <ConfigPanel />
    </div>
  );
}
