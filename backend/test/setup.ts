import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = mkdtempSync(join(tmpdir(), 'synapse-test-'));
process.env.DATA_DIR = dir;
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.API_KEY = 'test-api-key-0123456789';
process.env.ENCRYPTION_KEY = 'ab'.repeat(32);
process.env.PUBLIC_URL = 'http://localhost:3001';
// jamais la base Postgres du .env : seule une base jetable explicite (voir mirror.test.ts)
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? '';
