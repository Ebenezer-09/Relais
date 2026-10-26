import type { MouseEvent } from 'react';
import { Button, IconButton } from './ui/button';

const Divider = () => <div className="w-px h-5 bg-line" />;

export function Hud({ zoom, onZoomIn, onZoomOut, onFit, onAddBlock }: {
  zoom: number; onZoomIn: () => void; onZoomOut: () => void; onFit: () => void; onAddBlock: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className="absolute bottom-5 left-5 z-20 flex items-center gap-1 bg-surface border border-line p-1 rounded-lg shadow-sm"
      onPointerDown={(e) => e.stopPropagation()}>
      <IconButton icon="remove" title="Dézoomer" onClick={onZoomOut} />
      <div className="w-11 text-xs text-muted text-center tabular-nums">{Math.round(zoom * 100)} %</div>
      <IconButton icon="add" title="Zoomer" onClick={onZoomIn} />
      <IconButton icon="fit_screen" title="Ajuster la vue" onClick={onFit} />
      <Divider />
      <Button variant="primary" icon="add" className="ml-1" data-add-block onClick={onAddBlock}>Ajouter un bloc</Button>
    </div>
  );
}
