import { describe, expect, it } from 'vitest';
import { aedToFils, computeLine, filsToDecimal, qtyToMilli, sumLines } from '../worker/lib/money';
import { normalizePhone, uaeDate } from '../worker/lib/normalize';

describe('money', () => {
  it('parses AED and quantities without float drift', () => {
    expect(aedToFils('0.1')).toBe(10);
    expect(aedToFils('19.99')).toBe(1999);
    expect(aedToFils(250)).toBe(25000);
    expect(qtyToMilli('1.5')).toBe(1500);
    expect(() => aedToFils('1.234')).toThrow();
  });

  it('computes 5% VAT per line, rounding half up', () => {
    expect(computeLine({ quantityMilli: 1000, unitPriceFils: 10000, discountFils: 0, vatRateBp: 500 })).toEqual({ netFils: 10000, vatFils: 500 });
    // 0.10 AED at 5% = 0.005 -> 0.01
    expect(computeLine({ quantityMilli: 1000, unitPriceFils: 10, discountFils: 0, vatRateBp: 500 }).vatFils).toBe(1);
    // 4.5 L at 32.50 = 146.25, less 6.25 discount = 140.00, VAT 7.00
    expect(computeLine({ quantityMilli: 4500, unitPriceFils: 3250, discountFils: 625, vatRateBp: 500 })).toEqual({ netFils: 14000, vatFils: 700 });
    expect(() => computeLine({ quantityMilli: 1000, unitPriceFils: 100, discountFils: 200, vatRateBp: 500 })).toThrow();
  });

  it('sums and formats', () => {
    expect(sumLines([{ netFils: 10000, vatFils: 500 }, { netFils: 14000, vatFils: 700 }])).toEqual({ subtotalFils: 24000, vatFils: 1200, totalFils: 25200 });
    expect(filsToDecimal(25200)).toBe('252.00');
    expect(filsToDecimal(5)).toBe('0.05');
  });
});

describe('normalize', () => {
  it('turns UAE phone formats into E.164', () => {
    expect(normalizePhone('050 123 4567')).toBe('+971501234567');
    expect(normalizePhone('501234567')).toBe('+971501234567');
    expect(normalizePhone('00971501234567')).toBe('+971501234567');
    expect(normalizePhone('+92 300 1234567')).toBe('+923001234567');
  });

  it('uses the UAE calendar date', () => {
    expect(uaeDate(new Date('2026-10-18T21:30:00Z'))).toBe('2026-10-19');
  });
});
