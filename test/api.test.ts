import { describe, expect, it } from 'vitest';
import { setup } from './helpers';

const ahmed = {
  name_en: 'Ahmed Ali',
  name_ar: 'أحمد علي',
  phone: '050 123 4567',
  whatsapp_opt_in: true,
  vehicle: { plate_emirate: 'DXB', plate_code: 'k', plate_number: '12 345', make: 'Toyota', model: 'Land Cruiser', year: 2021, odometer: 84000 },
};

describe('intake', () => {
  it('adds a customer with a car and finds them by phone, plate and name', async () => {
    const { call } = await setup();
    const created = await call('POST', '/customers', ahmed);
    expect(created.status).toBe(201);
    expect(created.data.phone).toBe('+971501234567');
    expect(created.data.vehicles[0]).toMatchObject({ plate_code: 'K', plate_number: '12345', last_odometer: 84000 });

    for (const q of ['0501234567', '12345', 'K12345', 'ahmed', 'أحمد']) {
      const found = await call('GET', `/search?q=${encodeURIComponent(q)}`);
      expect(found.data.results.map((r: any) => r.id), q).toEqual([created.data.id]);
      expect(found.data.results[0].vehicles).toHaveLength(1);
    }
    expect((await call('GET', '/search?q=99999')).data.results).toEqual([]);
  });

  it('adds a second car and rejects a duplicate plate', async () => {
    const { call } = await setup();
    const { data: cust } = await call('POST', '/customers', ahmed);
    const second = await call('POST', `/customers/${cust.id}/vehicles`, { plate_emirate: 'SHJ', plate_number: '777', make: 'Nissan' });
    expect(second.status).toBe(201);
    expect(second.data.vehicles).toHaveLength(2);
    const dup = await call('POST', `/customers/${cust.id}/vehicles`, { plate_emirate: 'DXB', plate_code: 'K', plate_number: '12345' });
    expect(dup.status).toBe(409);
  });

  it('validates input', async () => {
    const { call } = await setup();
    const bad = await call('POST', '/customers', { name_en: '', phone: '1', trn: '123' });
    expect(bad.status).toBe(400);
    const paths = bad.data.issues.map((i: any) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['name_en', 'phone', 'trn']));
  });
});

async function serviceWithLines(call: Awaited<ReturnType<typeof setup>>['call'], branch = 'br_exs_1') {
  const { data: cust } = await call('POST', '/customers', { ...ahmed, vehicle: { ...ahmed.vehicle, plate_number: String(Math.random()).slice(2, 7) } });
  const { data: order } = await call('POST', '/service-orders', { vehicle_id: cust.vehicles[0].id, odometer_in: 85500, complaint: 'Oil change and brake noise' }, branch);
  await call('POST', `/service-orders/${order.id}/lines`, { kind: 'labour', description: 'Oil change labour', quantity: 1, unit_price: '100' }, branch);
  await call('POST', `/service-orders/${order.id}/lines`, { kind: 'part', description: 'Engine oil 5W-30', quantity: '4.5', unit_price: '32.50', discount: '6.25' }, branch);
  return { cust, order };
}

describe('service and invoice', () => {
  it('records a service with VAT totals and updates the odometer', async () => {
    const { call } = await setup();
    const { order, cust } = await serviceWithLines(call);
    const { data } = await call('GET', `/service-orders/${order.id}`);
    expect(data.lines).toHaveLength(2);
    expect(data.totals).toEqual({ subtotal_fils: 24000, vat_fils: 1200, total_fils: 25200 });
    const { data: c } = await call('GET', `/customers/${cust.id}`);
    expect(c.vehicles[0].last_odometer).toBe(85500);
  });

  it('issues gap-free invoice numbers per branch and freezes the service', async () => {
    const { call } = await setup();
    const a = await serviceWithLines(call, 'br_exs_1');
    const b = await serviceWithLines(call, 'br_exs_1');
    const other = await serviceWithLines(call, 'br_exs_2');

    const inv1 = await call('POST', `/service-orders/${a.order.id}/invoice`);
    expect(inv1.status).toBe(201);
    const again = await call('POST', `/service-orders/${a.order.id}/invoice`);
    expect(again.status).toBe(409);
    const inv2 = await call('POST', `/service-orders/${b.order.id}/invoice`);
    const inv3 = await call('POST', `/service-orders/${other.order.id}/invoice`, undefined, 'br_exs_2');

    const n1 = (await call('GET', `/invoices/${inv1.data.invoice_id}`)).data;
    const n2 = (await call('GET', `/invoices/${inv2.data.invoice_id}`)).data;
    const n3 = (await call('GET', `/invoices/${inv3.data.invoice_id}`)).data;
    expect([n1.invoice_number, n2.invoice_number, n3.invoice_number]).toEqual(['EXS1-000001', 'EXS1-000002', 'EXS2-000001']);
    expect(n1).toMatchObject({ subtotal_fils: 24000, vat_fils: 1200, total_fils: 25200, supplier_trn: '100000000000003', customer_name_ar: 'أحمد علي' });
    expect(n1.vehicle_desc).toMatch(/^DXB K \d+ · Toyota Land Cruiser 2021$/);
    expect(n1.lines.map((l: any) => l.line_no)).toEqual([1, 2]);

    const addLine = await call('POST', `/service-orders/${a.order.id}/lines`, { kind: 'labour', description: 'x', quantity: 1, unit_price: 1 });
    expect(addLine.status).toBe(409);
  });

  it('refuses to invoice an empty service', async () => {
    const { call } = await setup();
    const { data: cust } = await call('POST', '/customers', ahmed);
    const { data: order } = await call('POST', '/service-orders', { vehicle_id: cust.vehicles[0].id });
    expect((await call('POST', `/service-orders/${order.id}/invoice`)).status).toBe(400);
  });

  it('blocks edits to posted invoices at the database level', async () => {
    const { call, db } = await setup();
    const { order } = await serviceWithLines(call);
    const { data } = await call('POST', `/service-orders/${order.id}/invoice`);
    await expect(db.execute({ sql: 'UPDATE invoices SET total_fils = 1 WHERE id = ?', args: [data.invoice_id] })).rejects.toThrow(/credit note/);
    await expect(db.execute({ sql: 'DELETE FROM invoice_lines WHERE invoice_id = ?', args: [data.invoice_id] })).rejects.toThrow(/cannot be deleted/);
  });

  it('produces a PINT AE e-invoice file', async () => {
    const { call } = await setup();
    const { order } = await serviceWithLines(call);
    const { data } = await call('POST', `/service-orders/${order.id}/invoice`);
    const xml = await call('GET', `/invoices/${data.invoice_id}/xml`);
    expect(xml.status).toBe(200);
    const x: string = xml.data;
    expect(x).toContain('<cbc:CustomizationID>urn:peppol:pint:billing-1@ae-1</cbc:CustomizationID>');
    expect(x).toContain('<cbc:ID>EXS1-000001</cbc:ID>');
    expect(x).toContain('<cbc:EndpointID schemeID="0235">1000000000</cbc:EndpointID>');
    expect(x).toContain('<cbc:CompanyID>100000000000003</cbc:CompanyID>');
    expect(x).toContain('<cbc:TaxAmount currencyID="AED">12.00</cbc:TaxAmount>');
    expect(x).toContain('<cbc:PayableAmount currencyID="AED">252.00</cbc:PayableAmount>');
    expect(x).toContain('<cbc:InvoicedQuantity unitCode="C62">4.5</cbc:InvoicedQuantity>');
    expect(x).toContain('<cbc:Amount currencyID="AED">6.25</cbc:Amount>');
  });

  it('keeps branches apart', async () => {
    const { call } = await setup();
    await serviceWithLines(call, 'br_exs_1');
    expect((await call('GET', '/service-orders', undefined, 'br_exs_1')).data.orders).toHaveLength(1);
    expect((await call('GET', '/service-orders', undefined, 'br_exs_2')).data.orders).toHaveLength(0);
    expect((await call('GET', '/service-orders', undefined, 'nope')).status).toBe(400);
  });
});
