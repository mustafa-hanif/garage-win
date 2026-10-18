import type { Client } from '@libsql/client';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export type AppEnv = {
  Variables: { db: Client; tenantId: string };
};

export type AppContext = Context<AppEnv>;

export class HttpError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    message: string,
  ) {
    super(message);
  }
}

/** The branch the user is working in, sent by the app on every request. */
export async function requireBranch(c: AppContext): Promise<string> {
  const branchId = c.req.header('x-branch-id');
  if (!branchId) throw new HttpError(400, 'pick a branch first');
  const r = await c.get('db').execute({
    sql: 'SELECT id FROM branches WHERE id = ? AND tenant_id = ?',
    args: [branchId, c.get('tenantId')],
  });
  if (!r.rows.length) throw new HttpError(400, 'unknown branch');
  return branchId;
}
