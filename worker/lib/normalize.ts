export const EMIRATES = ['DXB', 'AUH', 'SHJ', 'AJM', 'UAQ', 'RAK', 'FUJ'] as const;
export type Emirate = (typeof EMIRATES)[number];

/**
 * Normalises a phone number to E.164. UAE local formats (050..., 50..., 00971...)
 * become +971...; numbers already starting with + keep their country code.
 */
export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith('971')) return `+${digits}`;
  if (digits.startsWith('0')) return `+971${digits.slice(1)}`;
  if (/^5\d{8}$/.test(digits)) return `+971${digits}`;
  return `+${digits}`;
}

/** Plate parts are stored upper-case without spaces so "a 12345" and "A12345" match. */
export function normalizePlatePart(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

/** Calendar date in the UAE (UTC+4, no daylight saving). */
export function uaeDate(now: Date = new Date()): string {
  return new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
}
