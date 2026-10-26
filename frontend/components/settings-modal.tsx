'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useFlow } from '@/lib/store';
import { Button, IconButton } from './ui/button';
import { FormField, Input } from './ui/form';
import { Logo } from './ui/logo';

// En production, l'adresse du serveur est fixée au déploiement (Vercel)
const FIXED_URL = !!process.env.NEXT_PUBLIC_API_URL;

/** Connexion : nom d'utilisateur + code PIN à 4 chiffres (ADMIN_USERNAME / ADMIN_PIN du serveur) */
export function SettingsModal() {
  const { settingsOpen, setSettingsOpen, conn, connOk, login, logout } = useFlow();
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [editUrl, setEditUrl] = useState(!FIXED_URL);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (settingsOpen) { setUrl(conn.url); setPin(''); setError(''); } }, [settingsOpen, conn]);
  if (!settingsOpen) return null;

  const close = () => setSettingsOpen(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await login(url, username, pin); } catch (err) { setError(err instanceof Error ? err.message : String(err)); setPin(''); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-ink/30 backdrop-blur-[2px]">
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="settings-title"
        className="w-full max-w-sm bg-surface rounded-xl shadow-xl border border-line">
        <div className="px-5 pt-5 flex items-start justify-between gap-3">
          <Logo size={36} />
          {connOk && <IconButton icon="close" title="Fermer" className="-mr-1.5 -mt-1" onClick={close} />}
        </div>
        <div className="px-5 pt-3">
          <h2 id="settings-title" className="text-base font-semibold">{connOk ? 'Vous êtes connecté' : 'Connexion'}</h2>
          <p className="text-muted mt-0.5">{connOk ? `Serveur : ${conn.url}` : 'Entrez votre nom d’utilisateur et votre code à 4 chiffres.'}</p>
        </div>
        {connOk ? (
          <div className="p-5">
            <Button size="md" type="button" className="w-full" onClick={logout}>Se déconnecter</Button>
          </div>
        ) : (
          <>
            <div className="p-5 space-y-4">
              <FormField label="Nom d'utilisateur" htmlFor="login-user">
                <Input id="login-user" required autoFocus autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} />
              </FormField>
              <FormField label="Code PIN" htmlFor="login-pin">
                <Input id="login-pin" type="password" required inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="current-password"
                  title="4 chiffres" className="font-mono text-lg tracking-[0.6em] text-center" value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
              </FormField>
              {editUrl ? (
                <FormField label="Adresse du serveur" htmlFor="api-url">
                  <Input id="api-url" type="url" required value={url} placeholder="https://relais-api.onrender.com" onChange={(e) => setUrl(e.target.value)} />
                </FormField>
              ) : (
                <p className="text-xs text-faint">Serveur : <span className="font-mono">{url}</span> · <button type="button" className="underline hover:text-ink" onClick={() => setEditUrl(true)}>modifier</button></p>
              )}
              {error && <p role="alert" className="text-danger">{error}</p>}
            </div>
            <div className="px-5 pb-5">
              <Button variant="primary" size="md" type="submit" className="w-full" disabled={busy || pin.length !== 4}>{busy ? 'Connexion…' : 'Se connecter'}</Button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
