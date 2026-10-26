'use client';

import type { ConfigValue, FieldDef } from '@/lib/types';
import { GoogleAccountField } from './google-account';
import { FormField, Input, Select, TextArea, Toggle } from './ui/form';
import { WhatsAppSession } from './whatsapp-session';

/** Rendu d'un champ de schéma (select, texte, code, interrupteur, session WhatsApp…) */
export function FieldControl({ field: f, value, onChange }: { field: FieldDef; value: ConfigValue | undefined; onChange: (v: ConfigValue) => void }) {
  if (f.type === 'wa-session') return <WhatsAppSession />;
  if (f.type === 'google-account') return <GoogleAccountField label={f.label!} required={f.required} value={String(value ?? '')} onChange={onChange} />;
  if (f.type === 'toggle') return <Toggle label={f.label!} checked={!!value} onChange={onChange} />;

  const id = 'f_' + f.key;
  const common = { id, 'data-field': f.key, placeholder: f.placeholder ?? '' };
  const str = String(value ?? '');
  let control;
  if (f.type === 'select') control = <Select id={id} options={f.options!} value={str} onChange={(e) => onChange(e.target.value)} />;
  else if (f.type === 'textarea' || f.type === 'code') {
    control = <TextArea {...common} code={f.type === 'code'} rows={f.rows ?? (f.type === 'code' ? 6 : 3)} value={str} onChange={(e) => onChange(e.target.value)} />;
  } else {
    control = (
      <Input {...common} type={f.type} step={f.step} value={str}
        onChange={(e) => onChange(f.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} />
    );
  }
  return <FormField label={f.label} htmlFor={id} required={f.required} help={f.help}>{control}</FormField>;
}
