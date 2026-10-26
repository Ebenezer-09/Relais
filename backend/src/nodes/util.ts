import { credentials } from '../db.js';
import type { Json } from '../types.js';

/** Charge l'identifiant référencé par le bloc (config.credentialId), sinon {} */
export function loadCred(config: Json): Json {
  if (!config.credentialId) return {};
  const d = credentials.getData(String(config.credentialId));
  if (!d) throw new Error('Identifiant introuvable (supprimé ?)');
  return d;
}
/** Valeur d'un champ : l'identifiant prime, sinon la valeur saisie dans le bloc */
export const field = (config: Json, cred: Json, key: string): string => String(cred[key] ?? config[key] ?? '').trim();
export const need = (value: string, label: string): string => {
  if (!value) throw new Error(`${label} manquant(e)`);
  return value;
};
export const num = (v: unknown, dflt: number): number => (v === '' || v === undefined || v === null || Number.isNaN(Number(v)) ? dflt : Number(v));
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export function parseJsonField(v: unknown, label: string): Json | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'object') return v as Json;
  try { return JSON.parse(String(v)); } catch { throw new Error(`${label} : JSON invalide`); }
}
