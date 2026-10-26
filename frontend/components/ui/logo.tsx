import { cx } from './cx';

/** Logo Relais : remplacez public/logo.png par le logo final, sans toucher au code */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- SVG statique, pas besoin de next/image
  return <img src="/logo.png" alt="" width={size} height={size} className={cx('shrink-0', className)} />;
}
