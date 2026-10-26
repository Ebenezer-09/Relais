import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// En local, les variables viennent de backend/.env ; en production (Render) du tableau de bord
if (existsSync('.env')) process.loadEnvFile('.env');

export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? '0.0.0.0',
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
  if (!/^[0-9a-fA-F]{64}$/.test(config.encryptionKey)) problems.push('ENCRYPTION_KEY doit contenir 64 caractères hexadécimaux (openssl rand -hex 32)');
  if (problems.length) {
    throw new Error('Configuration invalide :\n - ' + problems.join('\n - '));
  }
}
