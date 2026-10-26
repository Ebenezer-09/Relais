import type { FlowEdge, FlowNode } from './types';

/* ---------- connexion (URL du backend + jeton de session, gardés dans ce navigateur) ---------- */
const CONN_KEY = 'relais-api';
/** key : jeton de session obtenu par nom d'utilisateur + code PIN */
export interface Connection { url: string; key: string }
/** Émis quand le serveur refuse la session (expirée ou révoquée) */
export const LOGOUT_EVENT = 'relais:logout';

export function getConnection(): Connection {
  const dflt = { url: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001', key: '' };
  try { return { ...dflt, ...JSON.parse(localStorage.getItem(CONN_KEY) || '{}') }; } catch { return dflt; }
}
export function saveConnection(c: Connection) {
  try { localStorage.setItem(CONN_KEY, JSON.stringify({ url: c.url.trim().replace(/\/$/, ''), key: c.key.trim() })); } catch { /* stockage indisponible */ }
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}, conn = getConnection()): Promise<T> {
  let res: Response;
  try {
    res = await fetch(conn.url + path, {
      method: init.method ?? 'GET',
      headers: { ...(conn.key ? { authorization: `Bearer ${conn.key}` } : {}), ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    const local = /localhost|127\.0\.0\.1/.test(conn.url);
    throw new ApiError(local ? 'Le serveur ne répond pas. Lancez-le avec « npm run dev » à la racine du projet.' : `Serveur injoignable (${conn.url})`, 0);
  }
  const data = await res.json().catch(() => null);
  if (res.status === 401 && conn.key) window.dispatchEvent(new Event(LOGOUT_EVENT));
  if (!res.ok) throw new ApiError(data?.error || `Erreur HTTP ${res.status}`, res.status);
  return data as T;
}

/* ---------- types renvoyés par le backend ---------- */
export interface Graph { nodes: FlowNode[]; edges: FlowEdge[] }
export interface WorkflowRecord {
  id: string; name: string; active: boolean; running: boolean; graph: Graph; updatedAt: number;
  /** Jeton du lien client, ou null si non partagé */
  shareToken: string | null;
  webhook?: { method: string; test: string; production: string };
  warning?: string;
}
export interface NodeRun {
  node: string; nodeId: string; status: 'running' | 'success' | 'error'; startedAt: number; durationMs: number;
  input: unknown[]; output: Record<string, unknown[]>; error?: string;
}
export interface Execution {
  id: string; mode?: 'manual' | 'test' | 'production'; status: 'running' | 'success' | 'error'; error?: string; startedAt: number; finishedAt?: number;
  runData: NodeRun[]; result?: unknown[];
}
export interface CredentialMeta { id: string; name: string; type: string }
export interface WaSnapshot { id: string; status: 'disconnected' | 'connecting' | 'qr' | 'pairing' | 'connected'; qr?: string; pairingCode?: string; number?: string; method: 'qr' | 'pairing' }

/* ---------- appels ---------- */
/* ---------- vue client publique : sans clé, accès par le jeton du lien ---------- */
export type ExecutionSummary = Omit<Execution, 'runData' | 'result'>;
export interface SharedAgent { name: string; active: boolean; graph: Graph; executions: ExecutionSummary[] }

const publicUrl = (token: string, path = '') => `${getConnection().url}/public/${encodeURIComponent(token)}${path}`;
async function publicGet<T>(token: string, path = ''): Promise<T> {
  let res: Response;
  try { res = await fetch(publicUrl(token, path)); } catch { throw new ApiError('Serveur injoignable', 0); }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error || `Erreur HTTP ${res.status}`, res.status);
  return data as T;
}

export const publicApi = {
  agent: (token: string) => publicGet<SharedAgent>(token),
  execution: (token: string, id: string) => publicGet<Execution>(token, `/executions/${encodeURIComponent(id)}`),
  /** Chaque étape de chaque exécution, en direct */
  events: (token: string, onExecution: (e: Execution) => void): (() => void) => {
    const es = new EventSource(publicUrl(token, '/events'));
    es.onmessage = (e) => { try { onExecution(JSON.parse(e.data)); } catch { /* message mal formé */ } };
    return () => es.close();
  },
};

export const api = {
  /** Vérifie que le serveur répond ET que la session est valide */
  check: (conn: Connection) => request<CredentialMeta[]>('/api/credentials', {}, conn),
  login: (url: string, username: string, pin: string) =>
    request<{ token: string }>('/api/auth/login', { method: 'POST', body: { username, pin } }, { url, key: '' }),

  workflows: {
    list: () => request<WorkflowRecord[]>('/api/workflows'),
    get: (id: string) => request<WorkflowRecord>(`/api/workflows/${id}`),
    create: (name: string, graph: Graph) => request<WorkflowRecord>('/api/workflows', { method: 'POST', body: { name, graph } }),
    update: (id: string, name: string, graph: Graph) => request<WorkflowRecord>(`/api/workflows/${id}`, { method: 'PUT', body: { name, graph } }),
    activate: (id: string) => request<WorkflowRecord>(`/api/workflows/${id}/activate`, { method: 'POST' }),
    deactivate: (id: string) => request<WorkflowRecord>(`/api/workflows/${id}/deactivate`, { method: 'POST' }),
    run: (id: string, input: unknown) => request<Execution>(`/api/workflows/${id}/run`, { method: 'POST', body: { input } }),
    share: (id: string) => request<{ shareToken: string }>(`/api/workflows/${id}/share`, { method: 'POST' }),
    unshare: (id: string) => request<{ shareToken: null }>(`/api/workflows/${id}/share`, { method: 'DELETE' }),
  },

  credentials: {
    list: () => request<CredentialMeta[]>('/api/credentials'),
    create: (name: string, type: string, data: Record<string, string>) => request<CredentialMeta>('/api/credentials', { method: 'POST', body: { name, type, data } }),
    googleAuthUrl: (credentialId: string) => request<{ url: string; redirectUri: string }>('/api/oauth/google/url', { method: 'POST', body: { credentialId } }),
  },

  whatsapp: {
    status: (session: string) => request<WaSnapshot>(`/api/whatsapp/${session}/status`),
    connect: (session: string, method: 'qr' | 'pairing', phone: string) => request<WaSnapshot>(`/api/whatsapp/${session}/connect`, { method: 'POST', body: { method, phone } }),
    disconnect: (session: string) => request<WaSnapshot>(`/api/whatsapp/${session}/disconnect`, { method: 'POST' }),
    /** Flux SSE de l'état de session ; EventSource ne sait pas envoyer d'en-tête, d'où ?token= */
    events: (session: string, onSnapshot: (s: WaSnapshot) => void): (() => void) => {
      const { url, key } = getConnection();
      const es = new EventSource(`${url}/api/whatsapp/${session}/events?token=${encodeURIComponent(key)}`);
      es.onmessage = (e) => { try { onSnapshot(JSON.parse(e.data)); } catch { /* message mal formé */ } };
      return () => es.close();
    },
  },
};
