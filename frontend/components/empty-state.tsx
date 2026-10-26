'use client';

import { useFlow } from '@/lib/store';
import { Button } from './ui/button';
import { Logo } from './ui/logo';

export function EmptyState() {
  const { openCreate } = useFlow();
  return (
    <div className="absolute inset-0 flex items-center justify-center px-6 pointer-events-none">
      <div className="max-w-sm text-center pointer-events-auto">
        <Logo size={44} className="mx-auto mb-5" />
        <h1 className="text-xl font-semibold tracking-tight">Créez votre premier agent</h1>
        <p className="mt-2 text-muted leading-relaxed">Un agent répond à un message WhatsApp, Telegram, un email ou un appel d&apos;API. Choisissez ce qui le déclenche, puis ajoutez ses blocs.</p>
        <Button variant="primary" size="md" icon="add" className="mt-6" onPointerDown={(e) => e.stopPropagation()} onClick={openCreate}>Nouvel agent</Button>
      </div>
    </div>
  );
}
