import { useEffect, useState } from 'react';
import { api, getBranch, setBranch, type Branch } from './api';
import { useRoute } from './router';
import { Intake } from './pages/Intake';
import { CustomerPage } from './pages/CustomerPage';
import { ServicePage } from './pages/ServicePage';
import { InvoicePage } from './pages/InvoicePage';
import { InvoicesList, ServicesList } from './pages/Lists';

export function App() {
  const route = useRoute();
  const [tenant, setTenant] = useState<{ name_en: string } | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branch, setBranchState] = useState<string | null>(getBranch());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ tenant: { name_en: string }; branches: Branch[] }>('GET', '/branches').then(
      (r) => {
        setTenant(r.tenant);
        setBranches(r.branches);
        if (!r.branches.some((b) => b.id === getBranch()) && r.branches[0]) {
          setBranch(r.branches[0].id);
          setBranchState(r.branches[0].id);
        }
      },
      (e) => setError(String(e.message)),
    );
  }, []);

  const pick = (id: string) => {
    setBranch(id);
    setBranchState(id);
  };

  const [section, id] = route;
  const nav = (href: string, label: string, active: boolean) => (
    <a href={href} className={active ? 'active' : ''}>
      {label}
    </a>
  );

  return (
    <div className="app">
      <header className="topbar no-print">
        <a href="#/" className="brand">
          Garage Pro
          {tenant && <span className="tenant">{tenant.name_en}</span>}
        </a>
        <nav>
          {nav('#/', 'Intake', !section || section === 'customers')}
          {nav('#/services', 'Services', section === 'services')}
          {nav('#/invoices', 'Invoices', section === 'invoices')}
        </nav>
        {branches.length > 0 && (
          <select className="branch" value={branch ?? ''} onChange={(e) => pick(e.target.value)} aria-label="Branch">
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name_en}
              </option>
            ))}
          </select>
        )}
      </header>
      <main>
        {error ? (
          <p className="error-note">Can't reach the server: {error}</p>
        ) : !branch ? (
          <p className="muted">Loading…</p>
        ) : section === 'customers' && id ? (
          <CustomerPage id={id} key={id} />
        ) : section === 'services' && id ? (
          <ServicePage id={id} key={id} />
        ) : section === 'services' ? (
          <ServicesList branch={branch} />
        ) : section === 'invoices' && id ? (
          <InvoicePage id={id} key={id} />
        ) : section === 'invoices' ? (
          <InvoicesList branch={branch} />
        ) : (
          <Intake key={branch} />
        )}
      </main>
    </div>
  );
}
