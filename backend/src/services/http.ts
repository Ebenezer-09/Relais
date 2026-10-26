export interface HttpResult { status: number; ok: boolean; data: any }

export async function http(
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<HttpResult> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 60_000);
  opts.signal?.addEventListener('abort', () => ctl.abort());
  try {
    const res = await fetch(url, { method: opts.method ?? 'GET', headers: opts.headers, body: opts.body as any, signal: ctl.signal });
    const text = await res.text();
    let data: any = text;
    try { data = text ? JSON.parse(text) : null; } catch { /* texte brut */ }
    return { status: res.status, ok: res.ok, data };
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('Délai dépassé');
    throw new Error(`Erreur réseau : ${e?.cause?.code ?? e?.message ?? e}`);
  } finally {
    clearTimeout(timer);
  }
}

export const postJson = (url: string, body: unknown, headers: Record<string, string> = {}, timeoutMs?: number) =>
  http(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), timeoutMs });

export function apiError(service: string, r: HttpResult): Error {
  const d = r.data;
  const msg = typeof d === 'string' ? d : d?.error?.message ?? d?.error_description ?? d?.description ?? d?.message ?? (d?.error && typeof d.error === 'string' ? d.error : JSON.stringify(d));
  return new Error(`${service} (HTTP ${r.status}) : ${String(msg).slice(0, 400)}`);
}
