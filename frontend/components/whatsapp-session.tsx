'use client';

import { useFlow } from '@/lib/store';
import type { WaStatus } from '@/lib/types';
import { Button } from './ui/button';
import { FormField, Input, Select } from './ui/form';
import { Icon } from './ui/icon';

const STATUS: Record<WaStatus, [string, string]> = {
  disconnected: ['Non connecté', 'text-faint'], connecting: ['Connexion…', 'text-warn'], qr: ['En attente du scan', 'text-warn'],
  pairing: ['En attente du code', 'text-warn'], connected: ['Connecté', 'text-ok'],
};
const METHODS = [{ value: 'qr', label: 'Scanner un QR code' }, { value: 'pairing', label: 'Code de jumelage (par numéro)' }];

/** Session WhatsApp (Baileys) du serveur, partagée par tous les blocs WhatsApp */
export function WhatsAppSession() {
  const { wa, setWa, waConnect, waDisconnect } = useFlow();
  const [label, tone] = STATUS[wa.status];

  return (
    <div className="rounded-lg border border-line p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-medium">Session WhatsApp</div>
        <span className={`flex items-center gap-1.5 text-xs ${tone}`}><span className="w-1.5 h-1.5 rounded-full bg-current" />{label}</span>
      </div>

      {wa.status === 'connected' ? (
        <>
          <div className="flex items-center gap-2.5 p-3 rounded-md bg-subtle">
            <Icon name="verified" size={20} className="text-ok" />
            <div className="min-w-0"><div className="font-medium">Session active</div><div className="text-xs text-muted truncate">Numéro : {wa.number ? `+${wa.number}` : 'inconnu'}</div></div>
          </div>
          <Button className="w-full text-danger" onClick={waDisconnect}>Déconnecter la session</Button>
        </>
      ) : (
        <>
          <FormField label="Méthode de connexion">
            <Select options={METHODS} value={wa.method} onChange={(e) => setWa({ method: e.target.value as 'qr' | 'pairing' })} />
          </FormField>
          <FormField label="Numéro WhatsApp du compte" required={wa.method === 'pairing'} help={wa.method === 'qr' ? 'Optionnel avec le QR code.' : undefined}>
            <Input type="text" data-wa-field="phone" value={wa.phone} placeholder="212612345678, sans +" onChange={(e) => setWa({ phone: e.target.value })} />
          </FormField>

          {wa.status === 'qr' && wa.qr && (
            <div className="flex flex-col items-center gap-2 p-4 rounded-md bg-subtle">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL générée par le serveur */}
              <img src={wa.qr} alt="QR code de connexion WhatsApp" width={220} height={220} className="rounded-md" />
              <div className="text-xs text-muted text-center">WhatsApp → Appareils connectés → Connecter un appareil.<br />Le QR code se renouvelle tout seul.</div>
            </div>
          )}
          {wa.status === 'pairing' && wa.pairingCode && (
            <div className="p-4 rounded-md bg-subtle text-center">
              <div className="text-xs text-muted mb-1.5">Saisissez ce code dans WhatsApp → Appareils connectés → Connecter avec un numéro</div>
              <div className="font-mono text-2xl tracking-widest font-medium">{wa.pairingCode}</div>
            </div>
          )}

          <Button variant="primary" className="w-full" disabled={wa.status === 'connecting'} onClick={waConnect}>
            {wa.status === 'disconnected' ? (wa.method === 'qr' ? 'Générer le QR code' : 'Obtenir le code') : wa.status === 'connecting' ? 'Connexion…' : 'Recommencer'}
          </Button>
          <p className="text-xs text-faint">Utilisez un numéro dédié : WhatsApp peut bloquer les comptes qui envoient en masse.</p>
        </>
      )}
    </div>
  );
}
