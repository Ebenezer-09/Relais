import { credentials } from '../db.js';
import type { Json } from '../types.js';
import { apiError, http, postJson } from './http.js';

// Gmail + Google Sheets + Google Docs : un seul compte Google pour les trois blocs
const SCOPE = ['gmail.modify', 'spreadsheets', 'documents'].map((s) => `https://www.googleapis.com/auth/${s}`).join(' ');
const tokenCache = new Map<string, { token: string; exp: number }>();

export const googleScope = SCOPE;

export async function accessToken(credId: string): Promise<string> {
  const hit = tokenCache.get(credId);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const d = credentials.getData(credId);
  if (!d) throw new Error('Identifiant Google introuvable');
  if (!d.refreshToken) throw new Error("Compte Google non connecté : lancez l'autorisation depuis le builder");
  const r = await http('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: d.clientId, client_secret: d.clientSecret, refresh_token: d.refreshToken, grant_type: 'refresh_token' }).toString(),
  });
  if (!r.ok) throw apiError('Google OAuth', r);
  tokenCache.set(credId, { token: r.data.access_token, exp: Date.now() + (r.data.expires_in ?? 3600) * 1000 });
  return r.data.access_token;
}

async function gmail(credId: string, path: string, init: { method?: string; body?: unknown } = {}) {
  const token = await accessToken(credId);
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/${path}`;
  const headers = { authorization: `Bearer ${token}` };
  const r = init.body !== undefined ? await postJson(url, init.body, headers) : await http(url, { method: init.method ?? 'GET', headers });
  if (!r.ok) throw apiError('Gmail', r);
  return r.data;
}

/* --------------------------- envoi --------------------------- */
const clean = (s: string) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim(); // anti injection d'en-têtes
const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const encHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);

export interface MailInput {
  to: string; cc?: string; from?: string; subject: string; body: string; html?: boolean;
  threadId?: string; inReplyTo?: string;
}
export function buildMime(m: MailInput): string {
  const h: string[] = [];
  if (m.from) h.push(`From: ${clean(m.from)}`);
  h.push(`To: ${clean(m.to)}`);
  if (m.cc) h.push(`Cc: ${clean(m.cc)}`);
  h.push(`Subject: ${encHeader(clean(m.subject))}`);
  if (m.inReplyTo) { h.push(`In-Reply-To: ${clean(m.inReplyTo)}`); h.push(`References: ${clean(m.inReplyTo)}`); }
  h.push('MIME-Version: 1.0', `Content-Type: ${m.html ? 'text/html' : 'text/plain'}; charset=UTF-8`, 'Content-Transfer-Encoding: base64');
  const body = Buffer.from(m.body ?? '', 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
  return `${h.join('\r\n')}\r\n\r\n${body}`;
}

export async function sendMail(credId: string, m: MailInput): Promise<{ id: string; threadId: string }> {
  const raw = b64url(Buffer.from(buildMime(m), 'utf8'));
  const res = await gmail(credId, 'messages/send', { body: { raw, ...(m.threadId ? { threadId: m.threadId } : {}) } });
  return { id: res.id, threadId: res.threadId };
}

/* --------------------------- réception (polling) --------------------------- */
const decode = (data?: string) => (data ? Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8') : '');
const htmlToText = (h: string) => h.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, '').replace(/<br\s*\/?>|<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim();

function bodyOf(payload: Json): string {
  const walk = (p: Json, mime: string): string => {
    if (p.mimeType === mime && p.body?.data) return decode(p.body.data);
    for (const c of p.parts ?? []) { const r = walk(c, mime); if (r) return r; }
    return '';
  };
  return walk(payload, 'text/plain') || htmlToText(walk(payload, 'text/html'));
}

export async function fetchUnread(credId: string, opts: { from?: string; max?: number } = {}): Promise<Json[]> {
  const q = `in:inbox is:unread -from:me${opts.from ? ` from:${opts.from.replace(/[^\w@.+\-]/g, '')}` : ''}`;
  const list = await gmail(credId, `messages?q=${encodeURIComponent(q)}&maxResults=${opts.max ?? 10}`);
  const out: Json[] = [];
  for (const { id } of (list.messages ?? []).reverse()) {
    const m = await gmail(credId, `messages/${id}?format=full`);
    const hdr = (n: string) => (m.payload?.headers ?? []).find((h: Json) => h.name.toLowerCase() === n)?.value ?? '';
    out.push({
      from: hdr('from'), subject: hdr('subject'), body: bodyOf(m.payload ?? {}).slice(0, 100_000), snippet: m.snippet,
      date: hdr('date'), messageId: m.id, threadId: m.threadId, messageIdHeader: hdr('message-id'),
    });
    await gmail(credId, `messages/${id}/modify`, { body: { removeLabelIds: ['UNREAD'] } });
  }
  return out;
}

export async function profileEmail(credId: string): Promise<string> {
  return (await gmail(credId, 'profile')).emailAddress;
}
