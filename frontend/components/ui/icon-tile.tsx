import { cx } from './cx';
import { Icon } from './icon';

const SIZES = { sm: ['w-8 h-8', 18], md: ['w-9 h-9', 20] } as const;

/** Carré arrondi portant l'icône d'un type de bloc, teinté de sa couleur */
export function IconTile({ icon, color, size = 'sm', className }: { icon: string; color: string; size?: keyof typeof SIZES; className?: string }) {
  const [box, s] = SIZES[size];
  return (
    <span className={cx(box, 'rounded-md flex items-center justify-center shrink-0', className)} style={{ background: `${color}14`, color }}>
      <Icon name={icon} size={s} />
    </span>
  );
}
