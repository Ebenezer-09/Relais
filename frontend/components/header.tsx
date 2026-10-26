'use client';

import { useState } from 'react';
import { useFlow, type SaveState } from '@/lib/store';
import { AgentSwitcher } from './agent-switcher';
import { ShareDialog } from './share-dialog';
import { Button } from './ui/button';
import { cx } from './ui/cx';
import { Logo } from './ui/logo';

const SAVE_LABEL: Record<SaveState, string> = { idle: 'Modifications non enregistrées', saving: 'Enregistrement…', saved: 'Enregistré', error: 'Non enregistré' };

export function Header() {
  const [sharing, setSharing] = useState(false);
  const { flow, connOk, saveState, saveError, active, running, shareToken, validate, exportJson, openCreate, runTest, toggleActive, setSettingsOpen } = useFlow();
  const agent = flow.nodes.find((n) => n.type === 'trigger');
  const manual = agent?.trigger === 'Clic manuel';
  return (
    <header className="fixed top-0 inset-x-0 z-50 h-14 px-4 sm:px-5 flex items-center justify-between gap-3 bg-surface border-b border-line">
      <div className="flex items-center gap-2.5 min-w-0">
        <Logo />
        <span className="text-[15px] font-semibold tracking-tight">Relais</span>
        {agent && (
          <>
            <span className="text-line-strong" aria-hidden>/</span>
            <AgentSwitcher name={agent.name} />
            {connOk && (
              <span title={saveState === 'error' ? saveError : undefined}
                className={cx('max-md:hidden text-xs whitespace-nowrap', saveState === 'error' ? 'text-danger' : 'text-faint')}>{SAVE_LABEL[saveState]}</span>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => setSettingsOpen(true)} title={connOk ? 'Connecté' : 'Se connecter'}
          className={cx('flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs hover:bg-subtle', connOk ? 'text-muted' : 'text-danger')}>
          <span className={cx('w-1.5 h-1.5 rounded-full', connOk ? 'bg-ok' : 'bg-danger')} />
          <span className="max-lg:hidden">{connOk ? 'Serveur connecté' : connOk === null ? 'Connexion…' : 'Hors ligne'}</span>
        </button>
        <Button variant="ghost" icon="task_alt" className="max-lg:hidden" onClick={validate}>Vérifier</Button>
        <Button variant="ghost" icon="download" className="max-lg:hidden" onClick={exportJson}>Exporter</Button>
        {agent && (
          <>
            <Button variant="ghost" icon={shareToken ? 'link' : 'share'} className="max-sm:hidden" onClick={() => setSharing(true)}>{shareToken ? 'Lien client' : 'Partager'}</Button>
            <Button icon="play_arrow" disabled={running} onClick={runTest}
              title={manual ? 'Exécuter avec les données de test du déclencheur' : 'Exécuter une fois avec une entrée vide'}>{running ? 'Test…' : 'Tester'}</Button>
            {!manual && (
              <label className="max-sm:hidden flex items-center gap-2 h-8 px-2.5 rounded-md border border-line cursor-pointer select-none">
                <input type="checkbox" className="switch" checked={active} onChange={toggleActive} />
                <span className="font-medium">{active ? 'Actif' : 'Inactif'}</span>
              </label>
            )}
          </>
        )}
        <Button variant="primary" icon="add" className="ml-1" onClick={openCreate}>Nouvel agent</Button>
      </div>
      {sharing && <ShareDialog onClose={() => setSharing(false)} />}
    </header>
  );
}
