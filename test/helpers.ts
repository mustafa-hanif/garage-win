import { createClient, type Client } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../worker/app';
// @ts-expect-error plain JS module
import { migrate } from '../scripts/migrate.mjs';

export async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'garage-'));
  const db: Client = createClient({ url: `file:${join(dir, 'test.db')}` });
  await migrate(db);
  const app = createApp({ db: () => db, tenantId: () => 'tnt_excellence' });
  const call = async (method: string, path: string, body?: unknown, branch = 'br_exs_1') => {
    const res = await app.request(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-branch-id': branch },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const type = res.headers.get('content-type') ?? '';
    const data = type.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data: data as any };
  };
  return { db, app, call };
}
