import { useEffect, useRef, useState } from 'react';
import { api, carName, plate, type Customer, type CustomerDetail, type ServiceOrder } from '../api';
import { CustomerFields, ErrorNote, VehicleFields, customerDraft, customerPayload, useSubmit, vehicleDraft, vehiclePayload } from '../components/forms';
import { go } from '../router';

/** Front desk: find the customer by plate, phone or name, or add them with their car. */
export function Intake() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Customer[] | null>(null);
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    const ctl = { cancelled: false };
    const t = setTimeout(async () => {
      const r = await api<{ results: Customer[] }>('GET', `/search?q=${encodeURIComponent(q.trim())}`).catch(() => ({ results: [] }));
      if (!ctl.cancelled) setResults(r.results);
    }, 200);
    return () => {
      ctl.cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  if (adding) return <NewCustomer initialQuery={q} onCancel={() => setAdding(false)} />;

  return (
    <section>
      <h1>Service intake</h1>
      <div className="search">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by plate, mobile number or name"
          aria-label="Search customers"
          type="search"
          autoComplete="off"
        />
      </div>

      {results && results.length === 0 && (
        <div className="empty">
          <p>No customer matches “{q}”.</p>
          <button className="primary" onClick={() => setAdding(true)}>
            Add new customer and car
          </button>
        </div>
      )}

      {results && results.length > 0 && (
        <ul className="results">
          {results.map((c) => (
            <li key={c.id} className="card">
              <div className="card-head">
                <a href={`#/customers/${c.id}`} className="cust-name">
                  {c.name_en}
                  {c.name_ar && (
                    <span className="ar" dir="rtl" lang="ar">
                      {' '}
                      {c.name_ar}
                    </span>
                  )}
                </a>
                <span className="muted">{c.phone}</span>
              </div>
              <ul className="cars">
                {c.vehicles.map((v) => (
                  <li key={v.id}>
                    <span className="plate">{plate(v)}</span>
                    <span>{carName(v)}</span>
                    <StartServiceButton vehicleId={v.id} />
                  </li>
                ))}
                {!c.vehicles.length && <li className="muted">No cars yet</li>}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {!results && (
        <div className="empty">
          <p className="muted">Start typing to find a returning customer.</p>
          <button className="primary" onClick={() => setAdding(true)}>
            Add new customer and car
          </button>
        </div>
      )}
      {results && results.length > 0 && (
        <p>
          <button className="link" onClick={() => setAdding(true)}>
            Not listed? Add a new customer
          </button>
        </p>
      )}
    </section>
  );
}

export function StartServiceButton({ vehicleId, label = 'Start service' }: { vehicleId: string; label?: string }) {
  const { busy, error, submit } = useSubmit(async () => {
    const order = await api<ServiceOrder>('POST', '/service-orders', { vehicle_id: vehicleId });
    go(`/services/${order.id}`);
  });
  return (
    <>
      <button className="small" onClick={() => submit()} disabled={busy}>
        {label}
      </button>
      {error && <span className="field-error">{error}</span>}
    </>
  );
}

function NewCustomer({ initialQuery, onCancel }: { initialQuery: string; onCancel: () => void }) {
  const looksLikePhone = /^[\d\s+()-]{6,}$/.test(initialQuery.trim());
  const [cust, setCust] = useState(() => ({ ...customerDraft(), phone: looksLikePhone ? initialQuery.trim() : '', name_en: looksLikePhone ? '' : initialQuery.trim() }));
  const [veh, setVeh] = useState(vehicleDraft);
  const [odoIn, setOdoIn] = useState('');
  const [complaint, setComplaint] = useState('');

  const { busy, error, fields, submit } = useSubmit(async () => {
    const created = await api<CustomerDetail>('POST', '/customers', { ...customerPayload(cust), vehicle: vehiclePayload({ ...veh, odometer: odoIn }) });
    const order = await api<ServiceOrder>('POST', '/service-orders', {
      vehicle_id: created.vehicles[0].id,
      odometer_in: odoIn ? Number(odoIn.replace(/[,\s]/g, '')) : null,
      complaint,
    });
    go(`/services/${order.id}`);
  });

  return (
    <section>
      <h1>New customer</h1>
      <form onSubmit={submit} className="stack">
        <fieldset>
          <legend>Customer</legend>
          <CustomerFields value={cust} onChange={setCust} errors={fields} />
        </fieldset>
        <fieldset>
          <legend>Car</legend>
          <VehicleFields value={veh} onChange={setVeh} errors={fields} prefix="vehicle." withOdometer={false} />
        </fieldset>
        <fieldset>
          <legend>This visit</legend>
          <div className="grid">
            <label className="field">
              <span className="field-label">Odometer in (km)</span>
              <input value={odoIn} onChange={(e) => setOdoIn(e.target.value)} inputMode="numeric" />
            </label>
            <label className="field wide">
              <span className="field-label">What does the customer report?</span>
              <textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={3} />
            </label>
          </div>
        </fieldset>
        <ErrorNote error={error} />
        <div className="actions">
          <button type="button" onClick={onCancel}>
            Back
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save and open service'}
          </button>
        </div>
      </form>
    </section>
  );
}
