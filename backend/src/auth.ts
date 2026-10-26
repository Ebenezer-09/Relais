import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

/* Connexion administrateur : nom d'utilisateur + code PIN à 4 chiffres.
   Un PIN n'a que 10 000 combinaisons : les essais ratés sont limités par adresse IP ET au total. */
const SESSION_MS = 7 * 24 * 3600_000;
const PER_IP = { max: 5, lockMs: 15 * 60_000 };
const GLOBAL = { max: 30, windowMs: 3600_000, lockMs: 3600_000 };

export const sameSecret = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const sign = (exp: number) => createHmac('sha256', config.apiKey).update(`session.${exp}`).digest('base64url');

/** Jeton de session signé : « expiration.signature », sans stockage côté serveur */
export function verifySession(token: string): boolean {
  const [exp, sig] = token.split('.');
  return !!config.apiKey && Number(exp) > Date.now() && !!sig && sameSecret(sig, sign(Number(exp)));
}

const failures = new Map<string, { count: number; until: number }>();
let globalFails: number[] = [];
let globalUntil = 0;

export type LoginResult = { token: string } | { error: string; status: number; retryAfter?: number };

export function login(username: unknown, pin: unknown, ip: string, now = Date.now()): LoginResult {
  if (!config.adminUsername || !/^\d{4}$/.test(config.adminPin)) return { error: 'Connexion non configurée sur le serveur (ADMIN_USERNAME / ADMIN_PIN)', status: 503 };
  const f = failures.get(ip);
  const until = Math.max(f && f.count >= PER_IP.max ? f.until : 0, globalUntil);
  if (until > now) {
    const min = Math.ceil((until - now) / 60_000);
    return { error: `Trop d'essais. Réessayez dans ${min} min.`, status: 429, retryAfter: Math.ceil((until - now) / 1000) };
  }
  // les deux comparaisons sont toujours faites : la réponse ne révèle pas lequel est faux
  const okUser = sameSecret(String(username ?? '').trim().toLowerCase(), config.adminUsername.toLowerCase());
  const okPin = sameSecret(String(pin ?? ''), config.adminPin);
  if (okUser && okPin) {
    failures.delete(ip);
    const exp = now + SESSION_MS;
    return { token: `${exp}.${sign(exp)}` };
  }
  if (failures.size > 10_000) for (const [k, v] of failures) if (v.until <= now) failures.delete(k);
  const count = (f && f.until > now ? f.count : 0) + 1;
  failures.set(ip, { count, until: now + PER_IP.lockMs });
  globalFails = [...globalFails.filter((t) => t > now - GLOBAL.windowMs), now];
  if (globalFails.length >= GLOBAL.max) { globalUntil = now + GLOBAL.lockMs; globalFails = []; }
  const left = PER_IP.max - count;
  return { error: left > 0 ? `Identifiant ou code incorrect (${left} essai${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''})` : "Identifiant ou code incorrect. Accès bloqué 15 min.", status: 401 };
}

/** Réinitialise les compteurs (tests) */
export function resetLoginLimits() { failures.clear(); globalFails = []; globalUntil = 0; }
