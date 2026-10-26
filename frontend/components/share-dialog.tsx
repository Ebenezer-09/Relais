'use client';

import { useEffect, useState } from 'react';
import { useFlow } from '@/lib/store';
import { Button, IconButton } from './ui/button';

/** Lien à envoyer au client : il y voit son agent travailler en direct, sans pouvoir le modifier */
export function ShareDialog({ onClose }: { onClose: () => void }) {
  const { shareToken, shareAgent, unshareAgent, toast } = useFlow();
  const [busy, setBusy] = useState(false);
  const link = shareToken ? `${window.location.origin}/agent/${shareToken}` : '';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const act = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const copy = () => navigator.clipboard.writeText(link).then(() => toast('Lien copié.'));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-ink/30 backdrop-blur-[2px]">
      <div role="dialog" aria-modal="true" aria-labelledby="share-title" className="w-full max-w-md bg-surface rounded-xl shadow-xl border border-line">
        <div className="px-5 pt-5 pb-1 flex items-start justify-between gap-3">
          <div>
            <h2 id="share-title" className="text-base font-semibold">Partager avec le client</h2>
            <p className="text-muted mt-0.5">Le client suit son agent en direct : chaque message reçu, chaque étape et les valeurs produites. Il ne peut rien modifier et ne voit aucune clé.</p>
          </div>
          <IconButton icon="close" title="Fermer" className="-mr-1.5 -mt-1" onClick={onClose} />
        </div>
        <div className="p-5">
          {shareToken ? (
            <div className="flex gap-2">
              <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Lien client"
                className="flex-1 min-w-0 px-3 py-2 rounded-md border border-line bg-subtle font-mono text-xs" />
              <Button variant="primary" icon="content_copy" className="h-auto" onClick={copy}>Copier</Button>
            </div>
          ) : (
            <Button variant="primary" size="md" icon="link" className="w-full" disabled={busy} onClick={() => act(shareAgent)}>Créer le lien client</Button>
          )}
        </div>
        {shareToken && (
          <div className="px-5 py-4 border-t border-line flex justify-between gap-2">
            <Button variant="ghost" className="text-danger hover:text-danger" disabled={busy} onClick={() => act(unshareAgent)}>Désactiver le lien</Button>
            <Button disabled={busy} title="L'ancien lien cessera de fonctionner" onClick={() => act(shareAgent)}>Nouveau lien</Button>
          </div>
        )}
      </div>
    </div>
  );
}
