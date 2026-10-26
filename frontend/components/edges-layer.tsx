export interface EdgePath { id: string; d: string; color: string; mx: number; my: number }

/** Liens entre blocs ; la croix de suppression apparaît au survol du lien */
export function EdgesLayer({ paths, tmp = null, onDelete }: { paths: EdgePath[]; tmp?: string | null; onDelete?: (id: string) => void }) {
  return (
    <svg className="edges">
      {paths.map(({ id, d, color, mx, my }) => (
        <g key={id} className="edge-group">
          <path className="edge-hit" d={d} />
          <path className="edge" d={d} stroke={color} />
          {onDelete && <g className="edge-del" onPointerDown={(e) => { e.stopPropagation(); onDelete(id); }}>
            <title>Supprimer le lien</title>
            <circle cx={mx} cy={my} r={9} fill="#fff" stroke="#cdd2d8" strokeWidth={1} />
            <path d={`M${mx - 3},${my - 3}L${mx + 3},${my + 3}M${mx + 3},${my - 3}L${mx - 3},${my + 3}`} stroke="#c8372d" strokeWidth={1.6} strokeLinecap="round" />
          </g>}
        </g>
      ))}
      {tmp && <path className="edge" stroke="#0e7c66" strokeDasharray="4 4" d={tmp} />}
    </svg>
  );
}
