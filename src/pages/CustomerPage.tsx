import { useCallback, useEffect, useState } from 'react';
import { aed, api, carName, plate, shortDate, type CustomerDetail } from '../api';
import { CustomerFields, ErrorNote, VehicleFields, customerDraft, customerPayload, useSubmit, vehicleDraft, vehiclePayload } from '../components/forms';
import { StartServiceButton } from './Intake';

export function CustomerPage({ id }: { id: string }) {
  const [cust, setCust] = useState<CustomerDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [addingCar, setAddingCar] = useState(false);

  const load = useCallback(() => {
    api<CustomerDetail>('GET', `/customers/${id}`).then(setCust, (e) => setLoadError(String(e.message)));
  }, [id]);
  useEffect(load, [load]);

  if (loadError) return <p className="error-note">{loadError}</p>;
  if (!cust) return <p className="muted">Loading…</p>;

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>
            {cust.name_en}
            {cust.name_ar && (
              <span className="ar" dir="rtl" lang="ar">
                {' '}
                {cust.name_ar}
              </span>
            )}
          </h1>
          <p className="muted">
            {cust.phone}
            {cust.whatsapp_opt_in ? ' · WhatsApp ✓' : ''}
            {cust.trn ? ` · TRN ${cust.trn}` : ''}
            {cust.email ? ` · ${cust.email}` : ''}
          </p>
        </div>
        {!editing && <button onClick={() => setEditing(true)}>Edit</button>}
      </div>

      {editing && (
        <EditCustomer
          customer={cust}
          onDone={(c) => {
            setEditing(false);
            if (c) setCust(c);
          }}
        />
      )}

      <h2>Cars</h2>
      <ul className="cars card">
        {cust.vehicles.map((v) => (
          <li key={v.id}>
            <span className="plate">{plate(v)}</span>
            <span>
              {carName(v)}
              {v.color ? ` · ${v.color}` : ''}
              {v.last_odometer != null ? <span className="muted"> · {v.last_odometer.toLocaleString()} km</span> : null}
            </span>
            <StartServiceButton vehicleId={v.id} />
          </li>
        ))}
      </ul>
      {addingCar ? (
        <AddCar
          customerId={cust.id}
          onDone={(c) => {
            setAddingCar(false);
            if (c) setCust(c);
          }}
        />
      ) : (
        <button className="link" onClick={() => setAddingCar(true)}>
          + Add another car
        </button>
      )}

      <h2>Service history</h2>
      {cust.services.length === 0 ? (
        <p className="muted">No visits yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Car</th>
              <th>Work</th>
              <th>Invoice</th>
              <th className="num">Total (AED)</th>
            </tr>
          </thead>
          <tbody>
            {cust.services.map((s) => {
              const v = cust.vehicles.find((x) => x.id === s.vehicle_id);
              return (
                <tr key={s.id}>
                  <td>
                    <a href={`#/services/${s.id}`}>{shortDate(s.opened_at)}</a>
                  </td>
                  <td>{v ? plate(v) : ''}</td>
                  <td>{s.complaint ?? ''}</td>
                  <td>{s.invoice_id ? <a href={`#/invoices/${s.invoice_id}`}>{s.invoice_number}</a> : <span className="badge">Open</span>}</td>
                  <td className="num">{s.total_fils != null ? aed(s.total_fils) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function EditCustomer({ customer, onDone }: { customer: CustomerDetail; onDone: (c?: CustomerDetail) => void }) {
  const [draft, setDraft] = useState(() => customerDraft(customer));
  const { busy, error, fields, submit } = useSubmit(async () => onDone(await api<CustomerDetail>('PATCH', `/customers/${customer.id}`, customerPayload(draft))));
  return (
    <form onSubmit={submit} className="card stack">
      <CustomerFields value={draft} onChange={setDraft} errors={fields} />
      <ErrorNote error={error} />
      <div className="actions">
        <button type="button" onClick={() => onDone()}>
          Cancel
        </button>
        <button className="primary" disabled={busy}>
          Save
        </button>
      </div>
    </form>
  );
}

function AddCar({ customerId, onDone }: { customerId: string; onDone: (c?: CustomerDetail) => void }) {
  const [draft, setDraft] = useState(vehicleDraft);
  const { busy, error, fields, submit } = useSubmit(async () => onDone(await api<CustomerDetail>('POST', `/customers/${customerId}/vehicles`, vehiclePayload(draft))));
  return (
    <form onSubmit={submit} className="card stack">
      <VehicleFields value={draft} onChange={setDraft} errors={fields} />
      <ErrorNote error={error} />
      <div className="actions">
        <button type="button" onClick={() => onDone()}>
          Cancel
        </button>
        <button className="primary" disabled={busy}>
          Add car
        </button>
      </div>
    </form>
  );
}
