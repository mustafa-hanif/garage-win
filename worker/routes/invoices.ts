import { Hono } from 'hono';
import type { Row } from '@libsql/client';
import { HttpError, requireBranch, type AppContext, type AppEnv } from '../context';
import { buildPintAeXml } from '../lib/pint-ae';

export const invoices = new Hono<AppEnv>();

invoices.get('/', async (c) => {
  const branchId = await requireBranch(c);
  const r = await c.get('db').execute({
    sql: `SELECT id, invoice_number, issue_date, customer_name_en, vehicle_desc, subtotal_fils, vat_fils, total_fils
          FROM invoices WHERE branch_id = ? ORDER BY sequence_no DESC LIMIT 200`,
    args: [branchId],
  });
  return c.json({ invoices: r.rows });
});

invoices.get('/:id', async (c) => c.json(await loadInvoice(c, c.req.param('id'))));

/** The PINT AE (UBL 2.1) e-invoice file. */
invoices.get('/:id/xml', async (c) => {
  const inv = await loadInvoice(c, c.req.param('id'));
  const xml = buildPintAeXml({
    invoiceNumber: String(inv.invoice_number),
    issueDate: String(inv.issue_date),
    currency: String(inv.currency),
    supplier: {
      nameEn: String(inv.supplier_name_en),
      trn: (inv.supplier_trn as string | null) ?? null,
      addressLine: (inv.branch_address_line as string | null) ?? null,
      city: (inv.branch_city as string | null) ?? null,
      emirate: (inv.branch_emirate as string | null) ?? null,
    },
    customer: {
      nameEn: String(inv.customer_name_en),
      trn: (inv.customer_trn as string | null) ?? null,
      addressLine: (inv.customer_address as string | null) ?? null,
      city: null,
      emirate: null,
      phone: (inv.customer_phone as string | null) ?? null,
    },
    note: `Vehicle: ${inv.vehicle_desc}${inv.odometer != null ? ` · Odometer: ${inv.odometer} km` : ''}`,
    lines: inv.lines.map((l) => ({
      lineNo: Number(l.line_no),
      description: String(l.description),
      quantityMilli: Number(l.quantity_milli),
      unitPriceFils: Number(l.unit_price_fils),
      discountFils: Number(l.discount_fils),
      netFils: Number(l.net_fils),
      vatRateBp: Number(l.vat_rate_bp),
      vatFils: Number(l.vat_fils),
    })),
    subtotalFils: Number(inv.subtotal_fils),
    vatFils: Number(inv.vat_fils),
    totalFils: Number(inv.total_fils),
  });
  return c.body(xml, 200, {
    'content-type': 'application/xml; charset=utf-8',
    'content-disposition': `attachment; filename="${inv.invoice_number}.xml"`,
  });
});

async function loadInvoice(c: AppContext, id: string): Promise<Record<string, any> & { lines: Row[] }> {
  const db = c.get('db');
  const r = await db.execute({
    sql: `SELECT i.*, b.phone AS branch_phone, b.address_line AS branch_address_line, b.city AS branch_city, b.emirate AS branch_emirate
          FROM invoices i JOIN branches b ON b.id = i.branch_id
          WHERE i.id = ? AND i.tenant_id = ?`,
    args: [id, c.get('tenantId')],
  });
  if (!r.rows.length) throw new HttpError(404, 'invoice not found');
  const lines = await db.execute({ sql: 'SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY line_no', args: [id] });
  return { ...r.rows[0], lines: lines.rows };
}
