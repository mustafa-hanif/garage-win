import { useEffect, useState } from 'react';
import { aed, api, plate, shortDate, type InvoiceSummary, type ServiceSummary } from '../api';

export function ServicesList({ branch }: { branch: string }) {
  const [status, setStatus] = useState<'open' | 'invoiced' | ''>('open');
  const [orders, setOrders] = useState<ServiceSummary[] | null>(null);

  useEffect(() => {
    setOrders(null);
    api<{ orders: ServiceSummary[] }>('GET', `/service-orders${status ? `?status=${status}` : ''}`).then((r) => setOrders(r.orders));
  }, [status, branch]);

  return (
    <section>
      <div className="page-head">
        <h1>Services</h1>
        <div className="segmented">
          {(
            [
              ['open', 'In the workshop'],
              ['invoiced', 'Invoiced'],
              ['', 'All'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {!orders ? (
        <p className="muted">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Opened</th>
              <th>Car</th>
              <th>Customer</th>
              <th>Complaint</th>
              <th>Status</th>
              <th className="num">Total (AED)</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="clickable" onClick={() => (window.location.hash = `/services/${o.id}`)}>
                <td>
                  <a href={`#/services/${o.id}`}>{shortDate(o.opened_at)}</a>
                </td>
                <td>
                  <span className="plate">{plate(o)}</span> {[o.make, o.model].filter(Boolean).join(' ')}
                </td>
                <td>{o.customer_name}</td>
                <td>{o.complaint ?? ''}</td>
                <td>{o.invoice_number ?? <span className="badge">Open</span>}</td>
                <td className="num">{aed(o.running_total_fils)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function InvoicesList({ branch }: { branch: string }) {
  const [invoices, setInvoices] = useState<InvoiceSummary[] | null>(null);
  useEffect(() => {
    setInvoices(null);
    api<{ invoices: InvoiceSummary[] }>('GET', '/invoices').then((r) => setInvoices(r.invoices));
  }, [branch]);
  return (
    <section>
      <h1>Invoices</h1>
      {!invoices ? (
        <p className="muted">Loading…</p>
      ) : invoices.length === 0 ? (
        <p className="muted">No invoices at this branch yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Vehicle</th>
              <th className="num">Total (AED)</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id}>
                <td>
                  <a href={`#/invoices/${i.id}`}>{i.invoice_number}</a>
                </td>
                <td>{i.issue_date}</td>
                <td>{i.customer_name_en}</td>
                <td>{i.vehicle_desc}</td>
                <td className="num">{aed(i.total_fils)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
