import { useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, EMIRATES, EMIRATE_NAMES, type Customer, type Vehicle } from '../api';

export function Field(props: { label: string; error?: string; children: ReactNode; wide?: boolean; hint?: string }) {
  return (
    <label className={`field${props.wide ? ' wide' : ''}${props.error ? ' has-error' : ''}`}>
      <span className="field-label">{props.label}</span>
      {props.children}
      {props.error ? <span className="field-error">{props.error}</span> : props.hint ? <span className="field-hint">{props.hint}</span> : null}
    </label>
  );
}

export function useSubmit<T>(fn: () => Promise<T>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.fields);
        setError(Object.keys(err.fields).length ? 'Please check the highlighted fields.' : err.message);
      } else setError(String(err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, fields, submit };
}

export type CustomerDraft = {
  name_en: string;
  name_ar: string;
  phone: string;
  email: string;
  whatsapp_opt_in: boolean;
  trn: string;
  address_line: string;
  city: string;
  emirate: string;
};

export type VehicleDraft = {
  plate_emirate: string;
  plate_code: string;
  plate_number: string;
  make: string;
  model: string;
  year: string;
  vin: string;
  color: string;
  odometer: string;
};

export function customerDraft(c?: Customer): CustomerDraft {
  return {
    name_en: c?.name_en ?? '',
    name_ar: c?.name_ar ?? '',
    phone: c?.phone ?? '',
    email: c?.email ?? '',
    whatsapp_opt_in: c ? Boolean(c.whatsapp_opt_in) : true,
    trn: c?.trn ?? '',
    address_line: c?.address_line ?? '',
    city: c?.city ?? '',
    emirate: c?.emirate ?? '',
  };
}

export function vehicleDraft(v?: Vehicle): VehicleDraft {
  return {
    plate_emirate: v?.plate_emirate ?? 'DXB',
    plate_code: v?.plate_code ?? '',
    plate_number: v?.plate_number ?? '',
    make: v?.make ?? '',
    model: v?.model ?? '',
    year: v?.year ? String(v.year) : '',
    vin: v?.vin ?? '',
    color: v?.color ?? '',
    odometer: '',
  };
}

export function customerPayload(d: CustomerDraft) {
  return { ...d, emirate: d.emirate || null };
}

export function vehiclePayload(d: VehicleDraft) {
  return {
    ...d,
    year: d.year ? Number(d.year) : null,
    odometer: d.odometer ? Number(d.odometer.replace(/[,\s]/g, '')) : null,
  };
}

export function CustomerFields(props: { value: CustomerDraft; onChange: (d: CustomerDraft) => void; errors: Record<string, string>; prefix?: string }) {
  const { value: d, onChange, errors } = props;
  const p = props.prefix ?? '';
  const set = (k: keyof CustomerDraft) => (e: { target: { value: string } }) => onChange({ ...d, [k]: e.target.value });
  return (
    <div className="grid">
      <Field label="Name (English)" error={errors[p + 'name_en']}>
        <input value={d.name_en} onChange={set('name_en')} required autoComplete="off" />
      </Field>
      <Field label="الاسم (عربي) · Name (Arabic)" error={errors[p + 'name_ar']}>
        <input value={d.name_ar} onChange={set('name_ar')} dir="rtl" lang="ar" autoComplete="off" />
      </Field>
      <Field label="Mobile" error={errors[p + 'phone']} hint="e.g. 050 123 4567">
        <input value={d.phone} onChange={set('phone')} type="tel" inputMode="tel" required autoComplete="off" />
      </Field>
      <Field label="Email" error={errors[p + 'email']}>
        <input value={d.email} onChange={set('email')} type="email" autoComplete="off" />
      </Field>
      <Field label="TRN (business customers)" error={errors[p + 'trn']} hint="15 digits, if VAT registered">
        <input value={d.trn} onChange={set('trn')} inputMode="numeric" autoComplete="off" />
      </Field>
      <Field label="Emirate" error={errors[p + 'emirate']}>
        <select value={d.emirate} onChange={set('emirate')}>
          <option value="">-</option>
          {EMIRATES.map((e) => (
            <option key={e} value={e}>
              {EMIRATE_NAMES[e]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Address" error={errors[p + 'address_line']} wide>
        <input value={d.address_line} onChange={set('address_line')} autoComplete="off" />
      </Field>
      <label className="check wide">
        <input type="checkbox" checked={d.whatsapp_opt_in} onChange={(e) => onChange({ ...d, whatsapp_opt_in: e.target.checked })} />
        Customer agrees to WhatsApp updates
      </label>
    </div>
  );
}

export function VehicleFields(props: { value: VehicleDraft; onChange: (d: VehicleDraft) => void; errors: Record<string, string>; prefix?: string; withOdometer?: boolean }) {
  const { value: d, onChange, errors } = props;
  const p = props.prefix ?? '';
  const set = (k: keyof VehicleDraft) => (e: { target: { value: string } }) => onChange({ ...d, [k]: e.target.value });
  return (
    <div className="grid">
      <div className="plate-row wide">
        <Field label="Plate emirate" error={errors[p + 'plate_emirate']}>
          <select value={d.plate_emirate} onChange={set('plate_emirate')}>
            {EMIRATES.map((e) => (
              <option key={e} value={e}>
                {EMIRATE_NAMES[e]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Code" error={errors[p + 'plate_code']}>
          <input value={d.plate_code} onChange={set('plate_code')} maxLength={5} autoComplete="off" className="upper" />
        </Field>
        <Field label="Plate number" error={errors[p + 'plate_number']}>
          <input value={d.plate_number} onChange={set('plate_number')} required maxLength={10} autoComplete="off" className="upper" />
        </Field>
      </div>
      <Field label="Make" error={errors[p + 'make']}>
        <input value={d.make} onChange={set('make')} list="makes" autoComplete="off" />
      </Field>
      <Field label="Model" error={errors[p + 'model']}>
        <input value={d.model} onChange={set('model')} autoComplete="off" />
      </Field>
      <Field label="Year" error={errors[p + 'year']}>
        <input value={d.year} onChange={set('year')} inputMode="numeric" maxLength={4} autoComplete="off" />
      </Field>
      <Field label="Colour" error={errors[p + 'color']}>
        <input value={d.color} onChange={set('color')} autoComplete="off" />
      </Field>
      <Field label="VIN" error={errors[p + 'vin']}>
        <input value={d.vin} onChange={set('vin')} maxLength={17} autoComplete="off" className="upper" />
      </Field>
      {props.withOdometer !== false && (
        <Field label="Odometer (km)" error={errors[p + 'odometer']}>
          <input value={d.odometer} onChange={set('odometer')} inputMode="numeric" autoComplete="off" />
        </Field>
      )}
      <datalist id="makes">
        {['Toyota', 'Nissan', 'Lexus', 'Mitsubishi', 'Honda', 'Hyundai', 'Kia', 'Ford', 'Chevrolet', 'GMC', 'Mercedes-Benz', 'BMW', 'Audi', 'Volkswagen', 'Land Rover', 'Porsche', 'Mazda', 'Suzuki', 'Isuzu', 'Jeep', 'Dodge', 'Infiniti', 'MG', 'Changan', 'Geely'].map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </div>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  return error ? <p className="error-note" role="alert">{error}</p> : null;
}
