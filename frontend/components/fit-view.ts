import { NODE_W } from '@/lib/schema';
import type { FlowNode, View } from '@/lib/types';

/** Vue qui cadre tous les blocs dans le conteneur (moins la largeur d'un panneau ouvert à droite) */
export function fitView(nodes: FlowNode[], container: HTMLElement, rightPanel = 0): View | null {
  if (!nodes.length) return null;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const n of nodes) {
    const h = container.querySelector<HTMLElement>(`[data-id="${n.id}"]`)?.offsetHeight ?? 140;
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + NODE_W); y1 = Math.max(y1, n.y + h);
  }
  const r = container.getBoundingClientRect();
  const k = Math.max(0.3, Math.min(1.1, (r.width - rightPanel - 80) / (x1 - x0), (r.height - 120) / (y1 - y0)));
  return { k, x: (r.width - rightPanel - (x1 - x0) * k) / 2 - x0 * k, y: (r.height - (y1 - y0) * k) / 2 - y0 * k };
}
