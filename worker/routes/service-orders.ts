import { Hono } from 'hono';
import { z } from 'zod';
import { HttpError, requireBranch, type AppContext, type AppEnv } from '../context';
import { aedToFils, computeLine, qtyToMilli } from '../lib/money';
import { newId, uaeDate } from '../lib/normalize';

export const serviceOrders = new Hono<AppEnv>();

const openFields = z.object({
  vehicle_id: z.string().min(1),
  odometer_in: z.number().int().min(0).max(5_000_000).optional().nullable().transform((v) => v ?? null),
  complaint: z.string().trim().max(2000).optional().nullable().transform((v) => v || null),
});

const updateFields = z.object({
  odometer_in: z.number().int().min(0).max(5_000_000).nullable().optional(),
  complaint: z.string().trim().max(2000).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
});

const lineFields = z.object({
  kind: z.enum(['labour', 'part']),
  description: z.string().trim().min(1, 'description is required').max(500),
  quantity: z.union([z.string(), z.number()]).transform(qtyToMilli).refine((v) => v > 0, 'quantity must be more than 0'),
  unit_price: z.union([z.string(), z.number()]).transform(aedToFils),
  discount: z.union([z.string(), z.number()]).default(0).transform(aedToFils),
});

/** Open a service order for a car at the current branch. */
serviceOrders.post('/', async (c) => {
  const branchId = await requireBranch(c);
  const input = openFields.parse(await c.req.json());
  const db = c.get('db');
  const v = await db.execute({
    sql: 'SELECT id, customer_id, last_odometer FROM vehicles WHERE id = ? AND tenant_id = ?',
    args: [input.vehicle_id, c.get('tenantId')],
  });
  if (!v.rows.length) throw new HttpError(404, 'car not found');
  const vehicle = v.rows[0];
  const id = newId('svc');

  const stmts = [
    {
      sql: `INSERT INTO service_orders (id, tenant_id, branch_id, customer_id, vehicle_id, odometer_in, complaint)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [id, c.get('tenantId'), branchId, vehicle.customer_id, vehicle.id, input.odometer_in, input.complaint],
    },
  ];
  if (input.odometer_in !== null) {
    stmts.push(
      { sql: `INSERT INTO odometer_readings (id, vehicle_id, km, source) VALUES (?, ?, ?, 'service')`, args: [newId('odo'), vehicle.id, input.odometer_in] },
      { sql: 'UPDATE vehicles SET last_odometer = MAX(COALESCE(last_odometer, 0), ?) WHERE id = ?', args: [input.odometer_in, vehicle.id] },
    );
  }
  await db.batch(stmts, 'write');
  return c.json(await loadOrder(c, id), 201);
});

/** Service orders at the current branch, newest first. */
serviceOrders.get('/', async (c) => {
  const branchId = await requireBranch(c);
  const status = c.req.query('status');
  const r = await c.get('db').execute({
    sql: `SELECT so.id, so.status, so.opened_at, so.odometer_in, so.complaint,
                 cu.name_en AS customer_name, cu.phone AS customer_phone,
                 v.plate_emirate, v.plate_code, v.plate_number, v.make, v.model,
                 i.id AS invoice_id, i.invoice_number, i.total_fils,
                 (SELECT COALESCE(SUM(net_fils + vat_fils), 0) FROM service_lines sl WHERE sl.service_order_id = so.id) AS running_total_fils
          FROM service_orders so
          JOIN customers cu ON cu.id = so.customer_id
          JOIN vehicles v ON v.id = so.vehicle_id
          LEFT JOIN invoices i ON i.service_order_id = so.id
          WHERE so.branch_id = ? AND (? IS NULL OR so.status = ?)
          ORDER BY so.opened_at DESC LIMIT 100`,
    args: [branchId, status ?? null, status ?? null],
  });
  return c.json({ orders: r.rows });
});

serviceOrders.get('/:id', async (c) => c.json(await loadOrder(c, c.req.param('id'))));

serviceOrders.patch('/:id', async (c) => {
  const id = c.req.param('id');
  await loadOpenOrder(c, id);
  const input = updateFields.parse(await c.req.json());
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  for (const key of ['odometer_in', 'complaint', 'notes'] as const) {
    if (input[key] !== undefined) {
      sets.push(`${key} = ?`);
      args.push(input[key] === '' ? null : input[key]);
    }
  }
  if (sets.length) {
    await c.get('db').execute({ sql: `UPDATE service_orders SET ${sets.join(', ')} WHERE id = ?`, args: [...args, id] });
  }
  return c.json(await loadOrder(c, id));
});

serviceOrders.post('/:id/lines', async (c) => {
  const id = c.req.param('id');
  const order = await loadOpenOrder(c, id);
  const line = lineFields.parse(await c.req.json());
  const vatRateBp = await tenantVatRate(c);
  const { netFils, vatFils } = computeLine({
    quantityMilli: line.quantity,
    unitPriceFils: line.unit_price,
    discountFils: line.discount,
    vatRateBp,
  });
  await c.get('db').execute({
    sql: `INSERT INTO service_lines (id, service_order_id, kind, description, quantity_milli, unit_price_fils, discount_fils, net_fils, vat_rate_bp, vat_fils, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [newId('sln'), id, line.kind, line.description, line.quantity, line.unit_price, line.discount, netFils, vatRateBp, vatFils, order.lines.length],
  });
  return c.json(await loadOrder(c, id), 201);
});

serviceOrders.delete('/:id/lines/:lineId', async (c) => {
  const id = c.req.param('id');
  await loadOpenOrder(c, id);
  await c.get('db').execute({ sql: 'DELETE FROM service_lines WHERE id = ? AND service_order_id = ?', args: [c.req.param('lineId'), id] });
  return c.json(await loadOrder(c, id));
});

/**
 * Finalise the service into a tax invoice. Everything happens in one atomic batch:
 * take the branch's next number, snapshot supplier/customer/lines into the invoice,
 * and mark the order invoiced. invoices.service_order_id is UNIQUE, so a second
 * attempt fails and rolls back the counter, which keeps numbering gap-free.
 */
serviceOrders.post('/:id/invoice', async (c) => {
  const id = c.req.param('id');
  const order = await loadOpenOrder(c, id);
  if (!order.lines.length) throw new HttpError(400, 'add at least one labour or part line first');
  const db = c.get('db');
  const invoiceId = newId('inv');

  try {
    await db.batch(
      [
        { sql: 'UPDATE branches SET next_invoice_no = next_invoice_no + 1 WHERE id = ?', args: [order.branch_id] },
        {
          sql: `INSERT INTO invoices (
                  id, tenant_id, branch_id, service_order_id, invoice_number, sequence_no, issue_date, issued_at, currency,
                  supplier_name_en, supplier_name_ar, supplier_trn, supplier_address, branch_name_en, branch_name_ar,
                  customer_id, customer_name_en, customer_name_ar, customer_phone, customer_trn, customer_address,
                  vehicle_desc, odometer, subtotal_fils, vat_fils, total_fils)
                SELECT ?, so.tenant_id, so.branch_id, so.id,
                  b.invoice_prefix || '-' || printf('%06d', b.next_invoice_no - 1), b.next_invoice_no - 1,
                  ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), t.currency,
                  t.name_en, t.name_ar, t.trn,
                  trim(COALESCE(b.address_line, '') || ', ' || COALESCE(b.city, '') || ', ' || COALESCE(b.emirate, ''), ', '),
                  b.name_en, b.name_ar,
                  cu.id, cu.name_en, cu.name_ar, cu.phone, cu.trn,
                  NULLIF(trim(COALESCE(cu.address_line, '') || ', ' || COALESCE(cu.city, '') || ', ' || COALESCE(cu.emirate, ''), ', '), ''),
                  v.plate_emirate || ' ' || trim(v.plate_code || ' ' || v.plate_number) ||
                    COALESCE(' · ' || NULLIF(trim(COALESCE(v.make, '') || ' ' || COALESCE(v.model, '') || ' ' || COALESCE(v.year, '')), ''), ''),
                  so.odometer_in,
                  (SELECT COALESCE(SUM(net_fils), 0) FROM service_lines WHERE service_order_id = so.id),
                  (SELECT COALESCE(SUM(vat_fils), 0) FROM service_lines WHERE service_order_id = so.id),
                  (SELECT COALESCE(SUM(net_fils + vat_fils), 0) FROM service_lines WHERE service_order_id = so.id)
                FROM service_orders so
                JOIN branches b ON b.id = so.branch_id
                JOIN tenants t ON t.id = so.tenant_id
                JOIN customers cu ON cu.id = so.customer_id
                JOIN vehicles v ON v.id = so.vehicle_id
                WHERE so.id = ?`,
          args: [invoiceId, uaeDate(), id],
        },
        {
          sql: `INSERT INTO invoice_lines (id, invoice_id, line_no, kind, description, quantity_milli, unit_price_fils, discount_fils, net_fils, vat_rate_bp, vat_fils)
                SELECT ? || '_' || ROW_NUMBER() OVER (ORDER BY sort_order, created_at), ?,
                       ROW_NUMBER() OVER (ORDER BY sort_order, created_at),
                       kind, description, quantity_milli, unit_price_fils, discount_fils, net_fils, vat_rate_bp, vat_fils
                FROM service_lines WHERE service_order_id = ?`,
          args: [invoiceId, invoiceId, id],
        },
        { sql: `UPDATE service_orders SET status = 'invoiced' WHERE id = ?`, args: [id] },
      ],
      'write',
    );
  } catch (err) {
    if (/UNIQUE constraint failed: invoices\.service_order_id/.test(String((err as Error).message))) {
      throw new HttpError(409, 'this service is already invoiced');
    }
    throw err;
  }
  return c.json({ invoice_id: invoiceId }, 201);
});

async function tenantVatRate(c: AppContext): Promise<number> {
  const r = await c.get('db').execute({ sql: 'SELECT vat_rate_bp FROM tenants WHERE id = ?', args: [c.get('tenantId')] });
  return Number(r.rows[0]?.vat_rate_bp ?? 500);
}

async function loadOpenOrder(c: AppContext, id: string) {
  const order = await loadOrder(c, id);
  if (order.status !== 'open') throw new HttpError(409, 'this service is already invoiced');
  return order;
}

async function loadOrder(c: AppContext, id: string) {
  const db = c.get('db');
  const r = await db.execute({
    sql: `SELECT so.*, b.name_en AS branch_name, i.id AS invoice_id, i.invoice_number
          FROM service_orders so
          JOIN branches b ON b.id = so.branch_id
          LEFT JOIN invoices i ON i.service_order_id = so.id
          WHERE so.id = ? AND so.tenant_id = ?`,
    args: [id, c.get('tenantId')],
  });
  if (!r.rows.length) throw new HttpError(404, 'service not found');
  const order = r.rows[0];
  const [lines, customer, vehicle] = await Promise.all([
    db.execute({ sql: 'SELECT * FROM service_lines WHERE service_order_id = ? ORDER BY sort_order, created_at', args: [id] }),
    db.execute({ sql: 'SELECT * FROM customers WHERE id = ?', args: [order.customer_id] }),
    db.execute({ sql: 'SELECT * FROM vehicles WHERE id = ?', args: [order.vehicle_id] }),
  ]);
  const totals = lines.rows.reduce(
    (t, l) => ({ subtotal_fils: t.subtotal_fils + Number(l.net_fils), vat_fils: t.vat_fils + Number(l.vat_fils) }),
    { subtotal_fils: 0, vat_fils: 0 },
  );
  return {
    ...order,
    status: String(order.status),
    branch_id: String(order.branch_id),
    lines: lines.rows,
    customer: customer.rows[0],
    vehicle: vehicle.rows[0],
    totals: { ...totals, total_fils: totals.subtotal_fils + totals.vat_fils },
  };
}
