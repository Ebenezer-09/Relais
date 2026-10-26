import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// En local, les variables viennent de backend/.env ; en production (Render) du tableau de bord
if (existsSync('.env')) process.loadEnvFile('.env');

export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? '0.0.0.0',
  apiKey: process.env.API_KEY ?? '',
  adminUsername: (process.env.ADMIN_USERNAME ?? '').trim(),
  adminPin: (process.env.ADMIN_PIN ?? '').trim(),
  encryptionKey: process.env.ENCRYPTION_KEY ?? '',
  groqApiKey: process.env.GROQ_API ?? '',
  publicUrl: (process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3001}`).replace(/\/$/, ''),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  dataDir: resolve(process.env.DATA_DIR ?? './data'),
  maxNodeRuns: Number(process.env.MAX_NODE_RUNS ?? 2000),
  keepExecutions: Number(process.env.KEEP_EXECUTIONS ?? 500),
};

mkdirSync(config.dataDir, { recursive: true });

export function assertProductionConfig(): void {
  const problems: string[] = [];
  if (!config.apiKey || config.apiKey.length < 16) problems.push('API_KEY manquante ou trop courte (16 caractères minimum)');
  if (!config.adminUsername) problems.push('ADMIN_USERNAME manquant (nom de connexion)');
  if (!/^\d{4}$/.test(config.adminPin)) problems.push('ADMIN_PIN doit contenir exactement 4 chiffres');
  if (!/^[0-9a-fA-F]{64}$/.test(config.encryptionKey)) problems.push('ENCRYPTION_KEY doit contenir 64 caractères hexadécimaux (openssl rand -hex 32)');
  if (problems.length) {
    throw new Error('Configuration invalide :\n - ' + problems.join('\n - '));
  }
}
