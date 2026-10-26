'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { TRIGGER_NAMES } from '@/lib/schema';
import { useFlow } from '@/lib/store';
import type { TriggerName } from '@/lib/types';
import { Button, IconButton } from './ui/button';
import { FormField, Input, Select } from './ui/form';

export function AgentModal() {
  const { modalOpen, closeModal, createAgent } = useFlow();
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<TriggerName>(TRIGGER_NAMES[0]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen, closeModal]);

  if (!modalOpen) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // centre vertical du canvas (hauteur écran moins l'en-tête de 3.5rem)
    createAgent(name.trim(), trigger, Math.max(80, (window.innerHeight - 56) / 2 - 90));
    setName(''); setTrigger(TRIGGER_NAMES[0]);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-ink/30 backdrop-blur-[2px]">
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="agent-title"
        className="w-full max-w-md bg-surface rounded-xl shadow-xl border border-line">
        <div className="px-5 pt-5 pb-1 flex items-start justify-between gap-3">
          <div>
            <h2 id="agent-title" className="text-base font-semibold">Nouvel agent</h2>
            <p className="text-muted mt-0.5">Donnez-lui un nom et choisissez ce qui le déclenche.</p>
          </div>
          <IconButton icon="close" title="Fermer" className="-mr-1.5 -mt-1" onClick={closeModal} />
        </div>
        <div className="p-5 space-y-4">
          <FormField label="Nom" htmlFor="agent-name">
            <Input id="agent-name" autoFocus placeholder="Assistant support client" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Déclencheur" htmlFor="agent-trigger" help="Vous réglerez ses paramètres (QR code WhatsApp, token, URL…) juste après.">
            <Select id="agent-trigger" options={TRIGGER_NAMES} value={trigger} onChange={(e) => setTrigger(e.target.value as TriggerName)} />
          </FormField>
        </div>
        <div className="px-5 py-4 border-t border-line flex justify-end gap-2">
          <Button size="md" onClick={closeModal}>Annuler</Button>
          <Button variant="primary" size="md" type="submit">Créer l&apos;agent</Button>
        </div>
      </form>
    </div>
  );
}
