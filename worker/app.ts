import { Hono } from 'hono';
import type { Client } from '@libsql/client';
import { ZodError } from 'zod';
import { customers } from './routes/customers';
import { serviceOrders } from './routes/service-orders';
import { invoices } from './routes/invoices';
import { HttpError, type AppEnv } from './context';

export interface AppOptions {
  /** Returns the database client for a request. */
  db: (env: Record<string, unknown>) => Client;
  /** Single tenant until sign-in exists. */
  tenantId: (env: Record<string, unknown>) => string;
}

export function createApp(opts: AppOptions) {
  const app = new Hono<AppEnv>().basePath('/api');

  app.use('*', async (c, next) => {
    const env = (c.env ?? {}) as Record<string, unknown>;
    c.set('db', opts.db(env));
    c.set('tenantId', opts.tenantId(env));
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
    if (err instanceof ZodError) {
      return c.json({ error: 'invalid input', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, 400);
    }
    if (err instanceof RangeError) return c.json({ error: err.message }, 400);
    const msg = String((err as Error)?.message ?? err);
    if (/UNIQUE constraint failed: vehicles/.test(msg)) return c.json({ error: 'a car with this plate is already registered' }, 409);
    if (/already invoiced|cannot be (changed|deleted)/.test(msg)) return c.json({ error: msg.replace(/^.*?: /, '') }, 409);
    console.error(err);
    return c.json({ error: 'internal error' }, 500);
  });

  app.get('/health', (c) => c.json({ ok: true }));

  app.get('/branches', async (c) => {
    const db = c.get('db');
    const tenant = await db.execute({ sql: 'SELECT id, name_en, name_ar, trn, currency, vat_rate_bp FROM tenants WHERE id = ?', args: [c.get('tenantId')] });
    const branches = await db.execute({
      sql: 'SELECT id, name_en, name_ar, city, emirate, invoice_prefix FROM branches WHERE tenant_id = ? ORDER BY invoice_prefix',
      args: [c.get('tenantId')],
    });
    return c.json({ tenant: tenant.rows[0] ?? null, branches: branches.rows });
  });

  app.route('/', customers);
  app.route('/service-orders', serviceOrders);
  app.route('/invoices', invoices);

  app.notFound((c) => c.json({ error: 'not found' }, 404));
  return app;
}
