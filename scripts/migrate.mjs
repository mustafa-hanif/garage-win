// Applies migrations/*.sql in order to the Turso database, then the pilot seed.
// Usage: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:migrate
// For a throwaway local file: TURSO_DATABASE_URL=file:local.db npm run db:migrate
import { createClient } from '@libsql/client';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const dir = new URL('../migrations/', import.meta.url).pathname;

export async function migrate(db, { seed = true } = {}) {
  await db.execute('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set((await db.execute('SELECT name FROM _migrations')).rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = await readFile(join(dir, f), 'utf8');
    await db.executeMultiple(`BEGIN;\n${sql}\nINSERT INTO _migrations (name, applied_at) VALUES ('${f}', datetime('now'));\nCOMMIT;`);
    console.log(`applied ${f}`);
  }
  if (seed) await db.executeMultiple(await readFile(join(dir, 'seed.sql'), 'utf8'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    console.error('Set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN for a remote database).');
    process.exit(1);
  }
  const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  await migrate(db);
  console.log('database is up to date');
}
