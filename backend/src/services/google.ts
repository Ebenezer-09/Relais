import { accessToken } from './gmail.js';
import { apiError, http } from './http.js';

/** Appel authentifié à une API Google (Sheets, Docs) */
export async function google(service: string, credId: string, url: string, method = 'GET', body?: unknown) {
  const token = await accessToken(credId);
  const r = await http(url, { method, headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (r.status === 403 && /scope/i.test(JSON.stringify(r.data))) throw new Error(`${service} : le compte Google a été connecté avant l'ajout de ${service}. Reconnectez-le depuis le bloc.`);
  if (!r.ok) throw apiError(service, r);
  return r.data;
}

/** Accepte l'ID ou l'URL complète copiée depuis le navigateur */
export const googleFileId = (v: string) => v.match(/\/d\/([\w-]+)/)?.[1] ?? v.trim();
