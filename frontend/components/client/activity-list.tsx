import type { ExecutionSummary } from '@/lib/api';
import { execDuration, fmtDuration, fmtTime } from '@/lib/format';
import { cx } from '../ui/cx';

const STATUS = { running: ['En cours', 'text-warn'], success: ['Réussie', 'text-ok'], error: ['Erreur', 'text-danger'] } as const;

/** Exécutions récentes ; « En direct » suit automatiquement la plus récente */
export function ActivityList({ executions, shownId, live, onLive, onPick }: {
  executions: ExecutionSummary[]; shownId?: string; live: boolean; onLive: () => void; onPick: (id: string) => void;
}) {
  return (
    <div className="flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between">
        <h2 className="font-semibold">Activité</h2>
        <button type="button" onClick={onLive}
          className={cx('flex items-center gap-1.5 h-7 px-2 rounded-md text-xs', live ? 'text-ok bg-accent-soft' : 'text-muted hover:bg-subtle')}>
          <span className={cx('w-1.5 h-1.5 rounded-full bg-current', live && 'animate-pulse')} />{live ? 'En direct' : 'Revenir au direct'}
        </button>
      </div>
      {executions.length === 0 ? (
        <p className="p-4 text-muted">Aucune exécution pour l&apos;instant. Dès que l&apos;agent reçoit un message, vous verrez ici chaque étape en temps réel.</p>
      ) : (
        <ul className="overflow-y-auto p-1.5">
          {executions.map((e) => {
            const [label, tone] = STATUS[e.status];
            return (
              <li key={e.id}>
                <button type="button" onClick={() => onPick(e.id)}
                  className={cx('w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-md text-left hover:bg-subtle', e.id === shownId && 'bg-subtle')}>
                  <span className="min-w-0">
                    <span className="block font-medium tabular-nums">{fmtTime(e.startedAt)}</span>
                    <span className="block text-xs text-faint">{e.mode === 'production' ? 'Message reçu' : 'Test'}{e.status !== 'running' && `, ${fmtDuration(execDuration(e))}`}</span>
                  </span>
                  <span className={cx('flex items-center gap-1.5 text-xs shrink-0', tone)}>
                    <span className={cx('w-1.5 h-1.5 rounded-full bg-current', e.status === 'running' && 'animate-pulse')} />{label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
