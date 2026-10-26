'use client';

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { FlowEdge, FlowNode, Point } from '@/lib/types';
import { curve, portColor } from '@/lib/workflow';
import type { EdgePath } from './edges-layer';
import { portKey } from './node-card';

/** Tracés des liens, calculés depuis les ports réellement rendus (la hauteur d'un bloc dépend de son contenu) */
export function useEdgePaths(nodes: FlowNode[], edges: FlowEdge[], worldRef: RefObject<HTMLDivElement | null>, getZoom: () => number, extraDeps: unknown[] = []) {
  const ports = useRef(new Map<string, HTMLElement>());
  const [paths, setPaths] = useState<EdgePath[]>([]);

  const registerPort = useCallback((key: string, el: HTMLElement | null) => { if (el) ports.current.set(key, el); else ports.current.delete(key); }, []);
  const portCenter = useCallback((el: HTMLElement): Point => {
    const r = el.getBoundingClientRect(), w = worldRef.current!.getBoundingClientRect(), k = getZoom();
    return { x: (r.left + r.width / 2 - w.left) / k, y: (r.top + r.height / 2 - w.top) / k };
  }, [worldRef, getZoom]);

  useLayoutEffect(() => {
    const next = edges.flatMap((e): EdgePath[] => {
      const o = ports.current.get(portKey(e.from, e.port)), i = ports.current.get(portKey(e.to, 'in'));
      if (!o || !i) return [];
      const a = portCenter(o), b = portCenter(i);
      return [{ id: e.id, d: curve(a, b), color: portColor(e.port), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }];
    });
    setPaths((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- extraDeps : ce qui change la hauteur des blocs
  }, [nodes, edges, portCenter, ...extraDeps]);

  return { paths, registerPort, portCenter };
}
