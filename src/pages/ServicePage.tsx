import { useCallback, useEffect, useState } from 'react';
import { aed, api, carName, plate, qty, shortDate, type ServiceOrder } from '../api';
import { ErrorNote, Field, useSubmit } from '../components/forms';
import { go } from '../router';

export function ServicePage({ id }: { id: string }) {
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<ServiceOrder>('GET', `/service-orders/${id}`).then(setOrder, (e) => setLoadError(String(e.message)));
  }, [id]);
  useEffect(load, [load]);

  if (loadError) return <p className="error-note">{loadError}</p>;
  if (!order) return <p className="muted">Loading…</p>;
  const open = order.status === 'open';

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>
            <span className="plate big">{plate(order.vehicle)}</span> {carName(order.vehicle)}
          </h1>
          <p className="muted">
            <a href={`#/customers/${order.customer.id}`}>{order.customer.name_en}</a> · {order.customer.phone} · opened {shortDate(order.opened_at)} at {order.branch_name}
          </p>
        </div>
        {order.invoice_id ? (
          <a className="button primary" href={`#/invoices/${order.invoice_id}`}>
            View invoice {order.invoice_number}
          </a>
        ) : (
          <span className="badge">Open</span>
        )}
      </div>

      <VisitDetails order={order} onSaved={setOrder} />

      <h2>Work done</h2>
      <table className="table lines">
        <thead>
          <tr>
            <th>Type</th>
            <th>Description</th>
            <th className="num">Qty</th>
            <th className="num">Unit price</th>
            <th className="num">Discount</th>
            <th className="num">Net</th>
            <th className="num">VAT</th>
            {open && <th />}
          </tr>
        </thead>
        <tbody>
          {order.lines.map((l) => (
            <tr key={l.id}>
              <td>
                <span className={`kind ${l.kind}`}>{l.kind === 'labour' ? 'Labour' : 'Part'}</span>
              </td>
              <td>{l.description}</td>
              <td className="num">{qty(l.quantity_milli)}</td>
              <td className="num">{aed(l.unit_price_fils)}</td>
              <td className="num">{l.discount_fils ? aed(l.discount_fils) : ''}</td>
              <td className="num">{aed(l.net_fils)}</td>
              <td className="num">{aed(l.vat_fils)}</td>
              {open && (
                <td>
                  <button className="link danger" onClick={() => api<ServiceOrder>('DELETE', `/service-orders/${order.id}/lines/${l.id}`).then(setOrder)} aria-label="Remove line">
                    Remove
                  </button>
                </td>
              )}
            </tr>
          ))}
          {!order.lines.length && (
            <tr>
              <td colSpan={8} className="muted">
                No work added yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {open && <AddLine orderId={order.id} onAdded={setOrder} />}

      <div className="totals card">
        <div>
          <span>Subtotal (excl. VAT)</span>
          <span>AED {aed(order.totals.subtotal_fils)}</span>
        </div>
        <div>
          <span>VAT 5%</span>
          <span>AED {aed(order.totals.vat_fils)}</span>
        </div>
        <div className="grand">
          <span>Total</span>
          <span>AED {aed(order.totals.total_fils)}</span>
        </div>
      </div>

      {open && <Finalise order={order} />}
    </section>
  );
}

function VisitDetails({ order, onSaved }: { order: ServiceOrder; onSaved: (o: ServiceOrder) => void }) {
  const [odo, setOdo] = useState(order.odometer_in != null ? String(order.odometer_in) : '');
  const [complaint, setComplaint] = useState(order.complaint ?? '');
  const [notes, setNotes] = useState(order.notes ?? '');
  const open = order.status === 'open';
  const dirty = odo !== (order.odometer_in != null ? String(order.odometer_in) : '') || complaint !== (order.complaint ?? '') || notes !== (order.notes ?? '');

  const { busy, error, fields, submit } = useSubmit(async () => {
    onSaved(
      await api<ServiceOrder>('PATCH', `/service-orders/${order.id}`, {
        odometer_in: odo ? Number(odo.replace(/[,\s]/g, '')) : null,
        complaint: complaint || null,
        notes: notes || null,
      }),
    );
  });

  return (
    <form onSubmit={submit} className="card">
      <div className="grid">
        <Field label="Odometer in (km)" error={fields.odometer_in}>
          <input value={odo} onChange={(e) => setOdo(e.target.value)} inputMode="numeric" disabled={!open} />
        </Field>
        <Field label="Customer complaint" error={fields.complaint} wide>
          <textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={2} disabled={!open} />
        </Field>
        <Field label="Workshop notes (internal)" error={fields.notes} wide>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} disabled={!open} />
        </Field>
      </div>
      <ErrorNote error={error} />
      {open && dirty && (
        <div className="actions">
          <button className="primary" disabled={busy}>
            Save details
          </button>
        </div>
      )}
    </form>
  );
}

function AddLine({ orderId, onAdded }: { orderId: string; onAdded: (o: ServiceOrder) => void }) {
  const blank = { kind: 'labour' as 'labour' | 'part', description: '', quantity: '1', unit_price: '', discount: '' };
  const [line, setLine] = useState(blank);
  const { busy, error, fields, submit } = useSubmit(async () => {
    onAdded(await api<ServiceOrder>('POST', `/service-orders/${orderId}/lines`, { ...line, discount: line.discount || '0' }));
    setLine({ ...blank, kind: line.kind });
  });
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setLine({ ...line, [k]: e.target.value });

  return (
    <form onSubmit={submit} className="card add-line">
      <div className="segmented" role="radiogroup" aria-label="Line type">
        {(['labour', 'part'] as const).map((k) => (
          <button type="button" key={k} role="radio" aria-checked={line.kind === k} className={line.kind === k ? 'on' : ''} onClick={() => setLine({ ...line, kind: k })}>
            {k === 'labour' ? 'Labour' : 'Part'}
          </button>
        ))}
      </div>
      <div className="line-grid">
        <Field label="Description" error={fields.description}>
          <input value={line.description} onChange={set('description')} placeholder={line.kind === 'labour' ? 'e.g. Brake pad replacement' : 'e.g. Front brake pads'} required />
        </Field>
        <Field label="Qty" error={fields.quantity}>
          <input value={line.quantity} onChange={set('quantity')} inputMode="decimal" required />
        </Field>
        <Field label="Unit price (AED, excl. VAT)" error={fields.unit_price}>
          <input value={line.unit_price} onChange={set('unit_price')} inputMode="decimal" required />
        </Field>
        <Field label="Discount (AED)" error={fields.discount}>
          <input value={line.discount} onChange={set('discount')} inputMode="decimal" />
        </Field>
        <button className="primary" disabled={busy}>
          Add
        </button>
      </div>
      <ErrorNote error={error} />
    </form>
  );
}

function Finalise({ order }: { order: ServiceOrder }) {
  const [confirming, setConfirming] = useState(false);
  const { busy, error, submit } = useSubmit(async () => {
    const r = await api<{ invoice_id: string }>('POST', `/service-orders/${order.id}/invoice`);
    go(`/invoices/${r.invoice_id}`);
  });
  if (!order.lines.length) return null;
  return (
    <div className="finalise">
      {confirming ? (
        <div className="card confirm">
          <p>
            Issue a tax invoice for <strong>AED {aed(order.totals.total_fils)}</strong>? Once issued it can't be edited; corrections need a credit note.
          </p>
          <ErrorNote error={error} />
          <div className="actions">
            <button onClick={() => setConfirming(false)}>Not yet</button>
            <button className="primary" onClick={() => submit()} disabled={busy}>
              {busy ? 'Issuing…' : 'Issue tax invoice'}
            </button>
          </div>
        </div>
      ) : (
        <button className="primary big" onClick={() => setConfirming(true)}>
          Finish service and create invoice
        </button>
      )}
    </div>
  );
}
