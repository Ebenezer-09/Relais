'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type CredentialMeta } from '@/lib/api';
import { useFlow } from '@/lib/store';
import { Button } from './ui/button';
import { FormField, Input, Select } from './ui/form';

/** Choix d'un compte Google (identifiant googleOAuth du serveur) et connexion d'un nouveau compte */
export function GoogleAccountField({ label, required, value, onChange }: { label: string; required?: boolean; value: string; onChange: (id: string) => void }) {
  const { connOk, toast, setSettingsOpen } = useFlow();
  const [accounts, setAccounts] = useState<CredentialMeta[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: 'Google', clientId: '', clientSecret: '' });

  const refresh = useCallback(() => {
    api.credentials.list().then((l) => setAccounts(l.filter((c) => c.type === 'googleOAuth'))).catch(() => {});
  }, []);
  // le consentement Google se fait dans un autre onglet : on relit la liste au retour
  useEffect(() => {
    if (!connOk) return;
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [connOk, refresh]);

  const authorize = async (id: string) => {
    try { window.open((await api.credentials.googleAuthUrl(id)).url, '_blank', 'noopener'); } catch (e) { toast(e instanceof Error ? e.message : String(e)); }
  };
  const create = async () => {
    try {
      const c = await api.credentials.create(form.name.trim() || 'Google', 'googleOAuth', { clientId: form.clientId.trim(), clientSecret: form.clientSecret.trim() });
      onChange(c.id); setAdding(false); refresh();
      await authorize(c.id);
    } catch (e) { toast(e instanceof Error ? e.message : String(e)); }
  };

  if (!connOk) {
    return (
      <FormField label={label} required={required}>
        <Button className="w-full" onClick={() => setSettingsOpen(true)}>Se connecter au serveur d&apos;abord</Button>
      </FormField>
    );
  }

  return (
    <FormField label={label} required={required}
      help={!adding && value ? <button type="button" className="underline hover:text-ink" onClick={() => authorize(value)}>Autoriser à nouveau ce compte</button> : undefined}>
      {!adding ? (
        <div className="flex gap-2">
          <Select className="flex-1" value={value} onChange={(e) => onChange(e.target.value)}
            options={[{ value: '', label: accounts.length ? 'Choisir un compte…' : 'Aucun compte connecté' }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]} />
          <Button icon="add" className="h-auto" onClick={() => setAdding(true)}>Ajouter</Button>
        </div>
      ) : (
        <div className="rounded-lg border border-line p-3 space-y-3">
          <p className="text-xs text-muted">Créez un ID client OAuth « Application Web » dans Google Cloud (API Gmail, Google Sheets et Google Docs activées), puis collez-le ici. Google vous demandera ensuite d&apos;autoriser l&apos;accès.</p>
          <Input placeholder="Nom (ex. Compte support)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="ID client" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} />
          <Input type="password" placeholder="Code secret du client" value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAdding(false)}>Annuler</Button>
            <Button variant="primary" disabled={!form.clientId.trim() || !form.clientSecret.trim()} onClick={create}>Connecter le compte</Button>
          </div>
        </div>
      )}
    </FormField>
  );
}
