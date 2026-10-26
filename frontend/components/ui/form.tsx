import type { ComponentProps, ReactNode, SelectHTMLAttributes } from 'react';
import { cx } from './cx';

const INPUT = 'w-full bg-surface text-ink px-3 py-2 rounded-md border border-line placeholder:text-faint hover:border-line-strong focus:outline-none focus:border-accent focus:ring-3 focus:ring-accent-soft';

export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return <input autoComplete="off" className={cx(INPUT, className)} {...rest} />;
}

export function TextArea({ className, code, ...rest }: ComponentProps<'textarea'> & { code?: boolean }) {
  return <textarea spellCheck={code ? false : undefined} className={cx(INPUT, 'resize-y', code && 'font-mono text-xs leading-relaxed bg-subtle', className)} {...rest} />;
}

export function Select({ options, className, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { options: readonly (string | { value: string; label: string })[] }) {
  return (
    <select className={cx(INPUT, 'pr-8', className)} {...rest}>
      {options.map((o) => typeof o === 'string'
        ? <option key={o} value={o}>{o}</option>
        : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-0.5 cursor-pointer">
      <span className="font-medium">{label}</span>
      <input type="checkbox" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** Libellé + champ + aide */
export function FormField({ label, htmlFor, required, help, children }: {
  label: ReactNode; htmlFor?: string; required?: boolean; help?: ReactNode; children: ReactNode;
}) {
  return (
    <div>
      <label className="block font-medium mb-1.5" htmlFor={htmlFor}>
        {label}{required && <span className="text-danger ml-0.5" aria-hidden>*</span>}
      </label>
      {children}
      {help && <p className="text-xs text-faint mt-1.5">{help}</p>}
    </div>
  );
}
