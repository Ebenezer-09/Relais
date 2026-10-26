'use client';

import { useRef, type Ref } from 'react';
import type { ConfigValue, FieldDef } from '@/lib/types';
import { hideVars, showVars, type Var } from '@/lib/workflow';
import { GoogleAccountField } from './google-account';
import { FormField, Input, Select, TextArea, Toggle } from './ui/form';
import { WhatsAppSession } from './whatsapp-session';

type TextEl = HTMLInputElement | HTMLTextAreaElement;

/** Rendu d'un champ de schéma (select, texte, code, interrupteur, session WhatsApp…) */
export function FieldControl({ field: f, value, vars = [], onChange }: { field: FieldDef; value: ConfigValue | undefined; vars?: Var[]; onChange: (v: ConfigValue) => void }) {
  const ref = useRef<TextEl>(null);
  if (f.type === 'wa-session') return <WhatsAppSession />;
  if (f.type === 'google-account') return <GoogleAccountField label={f.label!} required={f.required} value={String(value ?? '')} onChange={onChange} />;
  if (f.type === 'toggle') return <Toggle label={f.label!} checked={!!value} onChange={onChange} />;

  const id = 'f_' + f.key;
  // Les données des blocs précédents s'affichent « Bloc › Donnée » au lieu de {{bloc.champ}} (sauf dans le code)
  const friendly = (f.type === 'text' || f.type === 'textarea') && vars.length > 0;
  const str = friendly ? showVars(String(value ?? ''), vars) : String(value ?? '');
  const ph = friendly ? showVars(f.placeholder ?? '', vars) : f.placeholder ?? '';
  const common = { id, placeholder: ph.includes('{{') ? '' : ph };
  const setText = (s: string) => onChange(friendly ? hideVars(s, vars) : s);

  /** Insère la donnée choisie à la position du curseur */
  const insert = (label: string) => {
    const el = ref.current, v = `«${label}»`;
    const s = el?.selectionStart ?? str.length, t = el?.selectionEnd ?? s;
    setText(str.slice(0, s) + v + str.slice(t));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(s + v.length, s + v.length); });
  };

  let control;
  if (f.type === 'select') control = <Select id={id} options={f.options!} value={str} onChange={(e) => onChange(e.target.value)} />;
  else if (f.type === 'textarea' || f.type === 'code') {
    control = <TextArea {...common} ref={ref as Ref<HTMLTextAreaElement>} code={f.type === 'code'} rows={f.rows ?? (f.type === 'code' ? 6 : 3)} value={str} onChange={(e) => setText(e.target.value)} />;
  } else {
    control = (
      <Input {...common} ref={ref as Ref<HTMLInputElement>} type={f.type} step={f.step} value={str}
        onChange={(e) => (f.type === 'number' ? onChange(e.target.value === '' ? '' : Number(e.target.value)) : setText(e.target.value))} />
    );
  }
  return (
    <FormField label={f.label} htmlFor={id} required={f.required} help={f.help}>
      {control}
      {friendly && (
        <div className="mt-1.5 flex flex-wrap gap-1" aria-label={`Ajouter une donnée dans « ${f.label} »`}>
          {vars.map((v) => (
            <button key={v.value} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(v.label)}
              className="px-2 py-0.5 rounded-md border border-line bg-subtle text-xs text-muted hover:border-accent hover:bg-accent-soft hover:text-accent">+ {v.label}</button>
          ))}
        </div>
      )}
    </FormField>
  );
}
