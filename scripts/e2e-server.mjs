import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
process.env.PORT = '3003'; process.env.VITE_PORT = '5174'; process.env.DATA_FILE = resolve('server/data', `salita-e2e-${randomUUID()}.json`); process.env.VITE_API_URL = 'http://127.0.0.1:3003/api/v1';
await import('./dev.mjs');
