'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';
import { COLORS, PALETTE, PALETTE_DESC, TYPE_META } from '@/lib/schema';
import type { BlockType, PaletteCtx } from '@/lib/types';
import { IconTile } from './ui/icon-tile';

/** Menu d'ajout de bloc, positionné près du point d'ouverture et gardé dans le canvas */
export function Palette({ ctx, containerRef, onPick }: { ctx: PaletteCtx; containerRef: RefObject<HTMLDivElement | null>; onPick: (t: BlockType) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const p = ref.current, c = containerRef.current;
    if (!p || !c) return;
    const r = c.getBoundingClientRect();
    const sx = ctx.screen ? ctx.screen.x : r.left + r.width / 2 - 120, sy = ctx.screen ? ctx.screen.y : r.top + 120;
    p.style.left = Math.max(8, Math.min(sx - r.left + 12, r.width - 270)) + 'px';
    p.style.top = Math.max(8, Math.min(sy - r.top - 20, r.height - p.offsetHeight - 8)) + 'px';
  }, [ctx, containerRef]);

  return (
    <div ref={ref} data-palette data-no-canvas role="menu" onPointerDown={(e) => e.stopPropagation()}
      className="absolute z-40 w-64 bg-surface rounded-lg shadow-lg border border-line p-1.5 max-h-[70vh] overflow-y-auto">
      {PALETTE.map((g) => (
        <div key={g.group}>
          <div className="px-2 pt-2 pb-1 text-xs font-medium text-faint">{g.group}</div>
          {g.items.map((t) => (
            <button key={t} type="button" role="menuitem" onClick={() => onPick(t)} className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-subtle text-left">
              <IconTile icon={TYPE_META[t].icon} color={COLORS[t]} />
              <span className="min-w-0"><span className="block font-medium">{TYPE_META[t].label}</span><span className="block text-xs text-muted">{PALETTE_DESC[t]}</span></span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
