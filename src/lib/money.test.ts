import { describe, expect, it } from 'vitest';

import { formatPence, parsePoundsToPence } from './money';

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
