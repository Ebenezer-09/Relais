import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';
import { Icon } from './icon';

const VARIANTS = {
  primary: 'bg-accent text-white hover:bg-accent-hover font-medium',
  secondary: 'bg-surface text-ink border border-line hover:bg-subtle hover:border-line-strong font-medium',
  ghost: 'text-muted hover:text-ink hover:bg-subtle font-medium',
};
const SIZES = { sm: 'gap-1.5 h-8 px-3', md: 'gap-2 h-9 px-4' };

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS; size?: keyof typeof SIZES; icon?: string };

export function Button({ variant = 'secondary', size = 'sm', icon, className, children, type = 'button', ...rest }: Props) {
  return (
    <button type={type} className={cx('inline-flex items-center justify-center rounded-md whitespace-nowrap', SIZES[size], VARIANTS[variant], className)} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

/** Bouton icône seule (fermer, supprimer, paramétrer) */
export function IconButton({ icon, tone = 'default', size = 'md', className, type = 'button', ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; tone?: 'default' | 'danger'; size?: 'sm' | 'md' }) {
  return (
    <button
      type={type}
      aria-label={rest.title}
      className={cx(
        'inline-flex items-center justify-center rounded-md hover:bg-subtle',
        size === 'sm' ? 'w-7 h-7' : 'w-8 h-8',
        tone === 'danger' ? 'text-faint hover:text-danger' : 'text-faint hover:text-ink',
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 18 : 20} />
    </button>
  );
}
