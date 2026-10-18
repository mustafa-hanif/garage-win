import { Hono } from 'hono';
import { z } from 'zod';
import type { InStatement, Row } from '@libsql/client';
import { HttpError, type AppEnv } from '../context';
import { EMIRATES, newId, normalizePhone, normalizePlatePart } from '../lib/normalize';

const optionalText = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const trn = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v.replace(/\s|-/g, '') : null))
  .refine((v) => v === null || /^\d{15}$/.test(v), 'TRN must be 15 digits');

const customerFields = z.object({
  name_en: z.string().trim().min(1, 'name is required').max(200),
  name_ar: optionalText,
  phone: z
    .string()
    .trim()
    .min(5, 'phone is required')
    .transform(normalizePhone)
    .refine((v) => /^\+\d{8,15}$/.test(v), 'phone number looks wrong'),
  email: optionalText.refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'email looks wrong'),
  whatsapp_opt_in: z.boolean().default(false),
  trn,
  address_line: optionalText,
  city: optionalText,
  emirate: z.enum(EMIRATES).optional().nullable().transform((v) => v ?? null),
});

const currentYear = new Date().getUTCFullYear();
const vehicleFields = z.object({
  plate_emirate: z.enum(EMIRATES),
  plate_code: z.string().trim().max(5).default('').transform(normalizePlatePart),
  plate_number: z.string().trim().min(1, 'plate number is required').max(10).transform(normalizePlatePart),
  make: optionalText,
  model: optionalText,
  year: z.number().int().min(1950).max(currentYear + 1).optional().nullable().transform((v) => v ?? null),
  vin: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v.toUpperCase() : null))
    .refine((v) => v === null || /^[A-HJ-NPR-Z0-9]{17}$/.test(v), 'VIN must be 17 characters'),
  color: optionalText,
  odometer: z.number().int().min(0).max(5_000_000).optional().nullable().transform((v) => v ?? null),
});

export const customers = new Hono<AppEnv>();

function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (m) => '\\' + m);
}

async function vehiclesFor(c: { get: (k: 'db') => AppEnv['Variables']['db'] }, customerIds: string[]): Promise<Row[]> {
  if (!customerIds.length) return [];
  const r = await c.get('db').execute({
    sql: `SELECT * FROM vehicles WHERE customer_id IN (${customerIds.map(() => '?').join(',')}) ORDER BY created_at`,
    args: customerIds,
  });
  return r.rows;
}

/** Find customers by name, phone or plate. */
customers.get('/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 2) return c.json({ results: [] });
  const tenantId = c.get('tenantId');
  const text = `%${likeEscape(q)}%`;
  const plate = `%${likeEscape(normalizePlatePart(q))}%`;
  const digits = q.replace(/\D/g, '').replace(/^(00971|971|0)/, '');
  const phone = digits.length >= 3 ? `%${digits}%` : null;

  const r = await c.get('db').execute({
    sql: `SELECT DISTINCT c.* FROM customers c
          LEFT JOIN vehicles v ON v.customer_id = c.id
          WHERE c.tenant_id = ?
            AND (c.name_en LIKE ? ESCAPE '\\' OR c.name_ar LIKE ? ESCAPE '\\'
                 OR (? IS NOT NULL AND c.phone LIKE ?)
                 OR v.plate_number LIKE ? ESCAPE '\\'
                 OR (v.plate_code || v.plate_number) LIKE ? ESCAPE '\\')
          ORDER BY c.updated_at DESC
          LIMIT 20`,
    args: [tenantId, text, text, phone, phone, plate, plate],
  });
  const vehicles = await vehiclesFor(c, r.rows.map((row) => String(row.id)));
  return c.json({
    results: r.rows.map((row) => ({ ...row, vehicles: vehicles.filter((v) => v.customer_id === row.id) })),
  });
});

/** Create a customer, optionally with their first car. */
customers.post('/customers', async (c) => {
  const { vehicle: veh = null, ...cust } = customerFields.extend({ vehicle: vehicleFields.optional().nullable() }).parse(await c.req.json());
  const tenantId = c.get('tenantId');
  const customerId = newId('cus');

  const stmts: InStatement[] = [
    {
      sql: `INSERT INTO customers (id, tenant_id, name_en, name_ar, phone, email, whatsapp_opt_in, trn, address_line, city, emirate)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [customerId, tenantId, cust.name_en, cust.name_ar, cust.phone, cust.email, cust.whatsapp_opt_in ? 1 : 0, cust.trn, cust.address_line, cust.city, cust.emirate],
    },
  ];
  if (veh) stmts.push(...insertVehicleStmts(tenantId, customerId, veh));
  await c.get('db').batch(stmts, 'write');
  return c.json(await loadCustomer(c, customerId), 201);
});

customers.get('/customers/:id', async (c) => c.json(await loadCustomer(c, c.req.param('id'))));

customers.patch('/customers/:id', async (c) => {
  const id = c.req.param('id');
  await loadCustomer(c, id);
  const cust = customerFields.parse(await c.req.json());
  await c.get('db').execute({
    sql: `UPDATE customers SET name_en = ?, name_ar = ?, phone = ?, email = ?, whatsapp_opt_in = ?, trn = ?,
            address_line = ?, city = ?, emirate = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id = ? AND tenant_id = ?`,
    args: [cust.name_en, cust.name_ar, cust.phone, cust.email, cust.whatsapp_opt_in ? 1 : 0, cust.trn, cust.address_line, cust.city, cust.emirate, id, c.get('tenantId')],
  });
  return c.json(await loadCustomer(c, id));
});

customers.post('/customers/:id/vehicles', async (c) => {
  const customerId = c.req.param('id');
  await loadCustomer(c, customerId);
  const veh = vehicleFields.parse(await c.req.json());
  await c.get('db').batch(insertVehicleStmts(c.get('tenantId'), customerId, veh), 'write');
  return c.json(await loadCustomer(c, customerId), 201);
});

customers.patch('/vehicles/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId');
  const existing = await c.get('db').execute({ sql: 'SELECT customer_id FROM vehicles WHERE id = ? AND tenant_id = ?', args: [id, tenantId] });
  if (!existing.rows.length) throw new HttpError(404, 'car not found');
  const veh = vehicleFields.omit({ odometer: true }).parse(await c.req.json());
  await c.get('db').execute({
    sql: `UPDATE vehicles SET plate_emirate = ?, plate_code = ?, plate_number = ?, make = ?, model = ?, year = ?, vin = ?, color = ?
          WHERE id = ? AND tenant_id = ?`,
    args: [veh.plate_emirate, veh.plate_code, veh.plate_number, veh.make, veh.model, veh.year, veh.vin, veh.color, id, tenantId],
  });
  return c.json(await loadCustomer(c, String(existing.rows[0].customer_id)));
});

function insertVehicleStmts(tenantId: string, customerId: string, veh: z.infer<typeof vehicleFields>): InStatement[] {
  const vehicleId = newId('veh');
  const stmts: InStatement[] = [
    {
      sql: `INSERT INTO vehicles (id, tenant_id, customer_id, plate_emirate, plate_code, plate_number, make, model, year, vin, color, last_odometer)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [vehicleId, tenantId, customerId, veh.plate_emirate, veh.plate_code, veh.plate_number, veh.make, veh.model, veh.year, veh.vin, veh.color, veh.odometer],
    },
  ];
  if (veh.odometer !== null) {
    stmts.push({
      sql: `INSERT INTO odometer_readings (id, vehicle_id, km, source) VALUES (?, ?, ?, 'intake')`,
      args: [newId('odo'), vehicleId, veh.odometer],
    });
  }
  return stmts;
}

async function loadCustomer(c: { get: <K extends keyof AppEnv['Variables']>(k: K) => AppEnv['Variables'][K] }, id: string) {
  const db = c.get('db');
  const r = await db.execute({ sql: 'SELECT * FROM customers WHERE id = ? AND tenant_id = ?', args: [id, c.get('tenantId')] });
  if (!r.rows.length) throw new HttpError(404, 'customer not found');
  const vehicles = await vehiclesFor(c, [id]);
  const services = await db.execute({
    sql: `SELECT so.id, so.vehicle_id, so.status, so.opened_at, so.odometer_in, so.complaint,
                 i.id AS invoice_id, i.invoice_number, i.total_fils
          FROM service_orders so LEFT JOIN invoices i ON i.service_order_id = so.id
          WHERE so.customer_id = ? ORDER BY so.opened_at DESC LIMIT 50`,
    args: [id],
  });
  return { ...r.rows[0], vehicles, services: services.rows };
}
