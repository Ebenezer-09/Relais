import { cx } from './cx';

/** Icône Material Symbols (police chargée dans app/layout.tsx) */
export function Icon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  return <span className={cx('material-symbols-outlined', className)} style={{ fontSize: size }} aria-hidden>{name}</span>;
}
