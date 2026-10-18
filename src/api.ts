export const EMIRATES = ['DXB', 'AUH', 'SHJ', 'AJM', 'UAQ', 'RAK', 'FUJ'] as const;

export const EMIRATE_NAMES: Record<string, string> = {
  DXB: 'Dubai',
  AUH: 'Abu Dhabi',
  SHJ: 'Sharjah',
  AJM: 'Ajman',
  UAQ: 'Umm Al Quwain',
  RAK: 'Ras Al Khaimah',
  FUJ: 'Fujairah',
};

export interface Vehicle {
  id: string;
  customer_id: string;
  plate_emirate: string;
  plate_code: string;
  plate_number: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  color: string | null;
  last_odometer: number | null;
}

export interface Customer {
  id: string;
  name_en: string;
  name_ar: string | null;
  phone: string;
  email: string | null;
  whatsapp_opt_in: number;
  trn: string | null;
  address_line: string | null;
  city: string | null;
  emirate: string | null;
  vehicles: Vehicle[];
}

export interface CustomerDetail extends Customer {
  services: Array<{
    id: string;
    vehicle_id: string;
    status: string;
    opened_at: string;
    odometer_in: number | null;
    complaint: string | null;
    invoice_id: string | null;
    invoice_number: string | null;
    total_fils: number | null;
  }>;
}

export interface ServiceLine {
  id: string;
  kind: 'labour' | 'part';
  description: string;
  quantity_milli: number;
  unit_price_fils: number;
  discount_fils: number;
  net_fils: number;
  vat_rate_bp: number;
  vat_fils: number;
}

export interface ServiceOrder {
  id: string;
  branch_id: string;
  branch_name: string;
  status: 'open' | 'invoiced';
  opened_at: string;
  odometer_in: number | null;
  complaint: string | null;
  notes: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  lines: ServiceLine[];
  customer: Customer;
  vehicle: Vehicle;
  totals: { subtotal_fils: number; vat_fils: number; total_fils: number };
}

export interface ServiceSummary {
  id: string;
  status: string;
  opened_at: string;
  complaint: string | null;
  customer_name: string;
  customer_phone: string;
  plate_emirate: string;
  plate_code: string;
  plate_number: string;
  make: string | null;
  model: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  running_total_fils: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  currency: string;
  supplier_name_en: string;
  supplier_name_ar: string | null;
  supplier_trn: string | null;
  supplier_address: string | null;
  branch_name_en: string;
  branch_name_ar: string | null;
  branch_phone: string | null;
  customer_name_en: string;
  customer_name_ar: string | null;
  customer_phone: string | null;
  customer_trn: string | null;
  customer_address: string | null;
  vehicle_desc: string;
  odometer: number | null;
  subtotal_fils: number;
  vat_fils: number;
  total_fils: number;
  lines: Array<ServiceLine & { line_no: number }>;
}

export interface InvoiceSummary {
  id: string;
  invoice_number: string;
  issue_date: string;
  customer_name_en: string;
  vehicle_desc: string;
  total_fils: number;
}

export interface Branch {
  id: string;
  name_en: string;
  name_ar: string | null;
  city: string | null;
  invoice_prefix: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

const BRANCH_KEY = 'garage.branch';

export function getBranch(): string | null {
  try {
    return localStorage.getItem(BRANCH_KEY);
  } catch {
    return null;
  }
}

export function setBranch(id: string) {
  try {
    localStorage.setItem(BRANCH_KEY, id);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const branch = getBranch();
  if (branch) headers['x-branch-id'] = branch;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fields: Record<string, string> = {};
    for (const i of data.issues ?? []) fields[i.path] = i.message;
    throw new ApiError(data.error ?? `request failed (${res.status})`, fields);
  }
  return data as T;
}

export function aed(fils: number | null | undefined): string {
  const n = Number(fils ?? 0) / 100;
  return n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function qty(milli: number): string {
  return String(milli / 1000);
}

export function plate(v: { plate_emirate: string; plate_code: string; plate_number: string }): string {
  return [v.plate_emirate, v.plate_code, v.plate_number].filter(Boolean).join(' ');
}

export function carName(v: { make: string | null; model: string | null; year?: number | null }): string {
  return [v.make, v.model, v.year].filter(Boolean).join(' ') || 'Car';
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' });
}
