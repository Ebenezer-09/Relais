import type { Metadata } from 'next';
import { ClientView } from '@/components/client/client-view';

export const metadata: Metadata = { title: 'Activité de votre agent · Relais', robots: { index: false, follow: false } };

export default async function AgentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ClientView token={token} />;
}
