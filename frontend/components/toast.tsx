'use client';

import { useFlow } from '@/lib/store';

export function Toast() {
  const { toastMsg } = useFlow();
  if (!toastMsg) return null;
  return (
    <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] max-w-md px-4 py-2.5 rounded-lg bg-ink text-white shadow-lg text-sm">
      {toastMsg.text}
    </div>
  );
}
