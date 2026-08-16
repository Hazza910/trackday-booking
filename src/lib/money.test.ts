import { describe, expect, it } from 'vitest';

import {
  BUYER_FEE_PERCENT,
  buyerFeeInPence,
  buyerTotalInPence,
  formatPence,
  parsePoundsToPence,
} from './money';

describe('parsePoundsToPence', () => {
  it.each([
    ['120', 12_000],
    ['120.50', 12_050],
    ['120.5', 12_050],
    ['10', 1_000],
    ['1000', 100_000],
    ['0', 0],
    ['0.01', 1],
    ['  120  ', 12_000],
    ['£120', 12_000],
    ['£1,000', 100_000],
    ['1,000.50', 100_050],
  ])('converts %j to %i pence', (input, pence) => {
    expect(parsePoundsToPence(input)).toEqual({ ok: true, pence });
  });

  it('is exact where floating point is not', () => {
    // Number('120.50') * 100 is 12050.000000000002, so the result must be an
    // integer, not merely close to one.
    for (const [input, pence] of [
      ['120.50', 12_050],
      ['0.07', 7],
      ['0.29', 29],
    ] as const) {
      const result = parsePoundsToPence(input);
      expect(result).toEqual({ ok: true, pence });
      if (result.ok) {
        expect(Number.isInteger(result.pence)).toBe(true);
      }
    }
  });

  it.each(['', '   ', '£', ' , '])('rejects %j as empty', (input) => {
    expect(parsePoundsToPence(input)).toEqual({ ok: false, reason: 'empty' });
  });

  it.each([
    '12.999',
    '-5',
    '-0.01',
    'abc',
    '12abc',
    '.50',
    '120.',
    '1e3',
    '12.3.4',
    '+120',
  ])('rejects %j on format', (input) => {
    expect(parsePoundsToPence(input)).toEqual({ ok: false, reason: 'format' });
  });
});

describe('formatPence', () => {
  it.each([
    [1_000, '£10'],
    [100_000, '£1,000'],
    [12_050, '£120.50'],
    [7, '£0.07'],
  ])('renders %i pence as %s', (pence, formatted) => {
    expect(formatPence(pence)).toBe(formatted);
  });
});

describe('buyerFeeInPence', () => {
  it('charges 5%', () => {
    expect(BUYER_FEE_PERCENT).toBe(5);
  });

  it('turns the £100 + £5 = £105 example into pence', () => {
    expect(buyerFeeInPence(10_000)).toBe(500);
    expect(buyerTotalInPence(10_000)).toBe(10_500);
    expect(formatPence(buyerTotalInPence(10_000))).toBe('£105');
  });

  it.each([
    [1_000, 50],
    [12_000, 600],
    [100_000, 5_000],
    [0, 0],
  ])('takes 5%% of %i pence as %i', (asking, fee) => {
    expect(buyerFeeInPence(asking)).toBe(fee);
  });

  it('rounds half-up when 5% is not whole pence', () => {
    // 5% of 12345p is 617.25p.
    expect(buyerFeeInPence(12_345)).toBe(617);
    // 5% of 1010p is exactly 50.5p — the tie, which goes up.
    expect(buyerFeeInPence(1_010)).toBe(51);
    // 5% of 12349p is 617.45p.
    expect(buyerFeeInPence(12_349)).toBe(617);
    // 5% of 12351p is 617.55p.
    expect(buyerFeeInPence(12_351)).toBe(618);
  });

  it('always returns whole pence', () => {
    for (let asking = 1_000; asking <= 100_000; asking += 7) {
      expect(Number.isInteger(buyerFeeInPence(asking))).toBe(true);
    }
  });

  it('never differs from a true 5% by more than half a penny', () => {
    for (let asking = 1_000; asking <= 100_000; asking += 13) {
      const exact = (asking * BUYER_FEE_PERCENT) / 100;
      expect(Math.abs(buyerFeeInPence(asking) - exact)).toBeLessThanOrEqual(0.5);
    }
  });

  it('keeps the total equal to the price plus the fee', () => {
    for (const asking of [1_000, 12_345, 99_999, 100_000]) {
      expect(buyerTotalInPence(asking)).toBe(asking + buyerFeeInPence(asking));
    }
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'throws on %j rather than quietly rounding it',
    (asking) => {
      expect(() => buyerFeeInPence(asking)).toThrow(/non-negative integer pence/);
    }
  );
});
