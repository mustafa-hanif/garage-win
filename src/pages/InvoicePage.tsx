import { useEffect, useState } from 'react';
import { aed, api, qty, type Invoice } from '../api';

/** Bilingual UAE tax invoice, laid out for A4 printing. */
export function InvoicePage({ id }: { id: string }) {
  const [inv, setInv] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Invoice>('GET', `/invoices/${id}`).then(setInv, (e) => setError(String(e.message)));
  }, [id]);

  if (error) return <p className="error-note">{error}</p>;
  if (!inv) return <p className="muted">Loading…</p>;

  return (
    <section>
      <div className="actions no-print">
        <button onClick={() => window.print()}>Print / save PDF</button>
        <a className="button primary" href={`/api/invoices/${inv.id}/xml`} download={`${inv.invoice_number}.xml`}>
          Download e-invoice (PINT AE XML)
        </a>
      </div>

      <article className="invoice">
        <header className="inv-head">
          <div>
            <div className="inv-supplier">{inv.supplier_name_en}</div>
            <div>{inv.branch_name_en}</div>
            {inv.supplier_address && <div>{inv.supplier_address}</div>}
            {inv.branch_phone && <div>{inv.branch_phone}</div>}
            {inv.supplier_trn && <div>TRN: {inv.supplier_trn}</div>}
          </div>
          <div className="ar" dir="rtl" lang="ar">
            <div className="inv-supplier">{inv.supplier_name_ar}</div>
            <div>{inv.branch_name_ar}</div>
            {inv.supplier_trn && <div>رقم التسجيل الضريبي: {inv.supplier_trn}</div>}
          </div>
        </header>

        <h1 className="inv-title">
          Tax Invoice <span lang="ar">فاتورة ضريبية</span>
        </h1>

        <div className="inv-meta">
          <dl>
            <Bi en="Invoice no." ar="رقم الفاتورة" value={inv.invoice_number} />
            <Bi en="Date" ar="التاريخ" value={inv.issue_date} />
            <Bi en="Vehicle" ar="المركبة" value={inv.vehicle_desc} />
            {inv.odometer != null && <Bi en="Odometer" ar="عداد المسافة" value={`${inv.odometer.toLocaleString()} km`} />}
          </dl>
          <dl>
            <Bi en="Customer" ar="العميل" value={inv.customer_name_ar ? `${inv.customer_name_en} / ${inv.customer_name_ar}` : inv.customer_name_en} />
            {inv.customer_phone && <Bi en="Phone" ar="الهاتف" value={inv.customer_phone} />}
            {inv.customer_trn && <Bi en="Customer TRN" ar="الرقم الضريبي للعميل" value={inv.customer_trn} />}
            {inv.customer_address && <Bi en="Address" ar="العنوان" value={inv.customer_address} />}
          </dl>
        </div>

        <table className="inv-lines">
          <thead>
            <tr>
              <th>
                # <small>م</small>
              </th>
              <th>
                Description <small lang="ar">الوصف</small>
              </th>
              <th className="num">
                Qty <small lang="ar">الكمية</small>
              </th>
              <th className="num">
                Unit price <small lang="ar">سعر الوحدة</small>
              </th>
              <th className="num">
                Discount <small lang="ar">الخصم</small>
              </th>
              <th className="num">
                Taxable <small lang="ar">المبلغ الخاضع</small>
              </th>
              <th className="num">
                VAT % <small lang="ar">نسبة الضريبة</small>
              </th>
              <th className="num">
                VAT <small lang="ar">الضريبة</small>
              </th>
              <th className="num">
                Total <small lang="ar">الإجمالي</small>
              </th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l) => (
              <tr key={l.line_no}>
                <td>{l.line_no}</td>
                <td>{l.description}</td>
                <td className="num">{qty(l.quantity_milli)}</td>
                <td className="num">{aed(l.unit_price_fils)}</td>
                <td className="num">{l.discount_fils ? aed(l.discount_fils) : '-'}</td>
                <td className="num">{aed(l.net_fils)}</td>
                <td className="num">{l.vat_rate_bp / 100}%</td>
                <td className="num">{aed(l.vat_fils)}</td>
                <td className="num">{aed(l.net_fils + l.vat_fils)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="inv-totals">
          <Row en="Total excl. VAT" ar="الإجمالي غير شامل الضريبة" value={inv.subtotal_fils} currency={inv.currency} />
          <Row en="VAT 5%" ar="ضريبة القيمة المضافة 5%" value={inv.vat_fils} currency={inv.currency} />
          <Row en="Total incl. VAT" ar="الإجمالي شامل الضريبة" value={inv.total_fils} currency={inv.currency} grand />
        </div>

        <footer className="inv-foot">
          <p>All amounts in UAE Dirhams (AED). · جميع المبالغ بالدرهم الإماراتي</p>
        </footer>
      </article>
    </section>
  );
}

function Bi({ en, ar, value }: { en: string; ar: string; value: string }) {
  return (
    <div className="bi">
      <dt>
        {en} <span lang="ar">{ar}</span>
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

function Row({ en, ar, value, currency, grand }: { en: string; ar: string; value: number; currency: string; grand?: boolean }) {
  return (
    <div className={grand ? 'grand' : ''}>
      <span>
        {en} <span lang="ar">{ar}</span>
      </span>
      <span>
        {currency} {aed(value)}
      </span>
    </div>
  );
}
