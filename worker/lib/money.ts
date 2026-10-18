// All amounts are integer fils (1 AED = 100 fils). Quantities are integer thousandths.

export interface LineInput {
  quantityMilli: number;
  unitPriceFils: number;
  discountFils: number;
  vatRateBp: number;
}

export interface LineAmounts {
  netFils: number;
  vatFils: number;
}

/** Rounds half away from zero, so 0.5 fils becomes 1 fil. */
function roundHalfUp(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n));
}

export function computeLine(line: LineInput): LineAmounts {
  const gross = roundHalfUp((line.quantityMilli * line.unitPriceFils) / 1000);
  const netFils = gross - line.discountFils;
  if (netFils < 0) throw new RangeError('discount is larger than the line amount');
  const vatFils = roundHalfUp((netFils * line.vatRateBp) / 10000);
  return { netFils, vatFils };
}

export function sumLines(lines: LineAmounts[]): { subtotalFils: number; vatFils: number; totalFils: number } {
  const subtotalFils = lines.reduce((s, l) => s + l.netFils, 0);
  const vatFils = lines.reduce((s, l) => s + l.vatFils, 0);
  return { subtotalFils, vatFils, totalFils: subtotalFils + vatFils };
}

/** Parses "12.5" or 12.5 (AED) into fils without floating-point drift. */
export function aedToFils(value: string | number): number {
  const s = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new RangeError(`invalid amount: ${s}`);
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

/** Parses "1.5" into thousandths (1500). Up to 3 decimals. */
export function qtyToMilli(value: string | number): number {
  const s = String(value).trim();
  if (!/^\d+(\.\d{1,3})?$/.test(s)) throw new RangeError(`invalid quantity: ${s}`);
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 1000 + Number(frac.padEnd(3, '0'));
}

export function filsToDecimal(fils: number): string {
  const sign = fils < 0 ? '-' : '';
  const abs = Math.abs(fils);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function milliToDecimal(milli: number): string {
  const whole = Math.floor(milli / 1000);
  const frac = String(milli % 1000).padStart(3, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : String(whole);
}
