'use client';

import { AgentModal } from '@/components/agent-modal';
import { Canvas } from '@/components/canvas';
import { Header } from '@/components/header';
import { Toast } from '@/components/toast';
import { FlowProvider } from '@/lib/store';

export default function Home() {
  return (
    <FlowProvider>
      <Header />
      <main className="w-full pt-14">
        <Canvas />
        <AgentModal />
        <Toast />
      </main>
    </FlowProvider>
  );
}
