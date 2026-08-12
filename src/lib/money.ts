/**
 * Money handling for prices a seller types in pounds.
 *
 * Money is stored as integer pence everywhere (see CLAUDE.md). Pence is an
 * implementation detail: sellers type pounds, and every message they see is
 * phrased in pounds.
 */

/** £10 — below this a listing is not worth the transfer admin. */
export const MIN_PRICE_IN_PENCE = 1_000;

/** £1,000 — above this is almost certainly a typo, not a track day place. */
export const MAX_PRICE_IN_PENCE = 100_000;

/**
 * Digits with an optional 1-2 digit decimal part. No sign and no exponent, so
 * "-5" and "1e3" fail here rather than sneaking through to the bounds check.
 */
const POUNDS_PATTERN = /^\d{1,7}(?:\.\d{1,2})?$/;

export type ParsedPounds =
  | { readonly ok: true; readonly pence: number }
  | { readonly ok: false; readonly reason: 'empty' | 'format' };

/**
 * People type money the way they say it. A currency symbol, thousands
 * separators and stray spaces are forgiven; a leading minus deliberately is
 * not, so negative amounts still fail the pattern.
 */
function normalisePounds(raw: string) {
  return raw.replace(/[£,\s]/g, '');
}

export function parsePoundsToPence(raw: string): ParsedPounds {
  const value = normalisePounds(raw);

  if (value.length === 0) {
    return { ok: false, reason: 'empty' };
  }
  if (!POUNDS_PATTERN.test(value)) {
    return { ok: false, reason: 'format' };
  }

  // Integer arithmetic only. `Number('120.50') * 100` is the kind of thing that
  // produces 12050.000000000002, so the two halves are converted separately.
  const [whole, fraction = ''] = value.split('.');
  return { ok: true, pence: Number(whole) * 100 + Number(fraction.padEnd(2, '0')) };
}

const poundsFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
});

const wholePoundsFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 0,
});

/** "£120", "£120.50", "£1,000" — whole amounts drop the trailing ".00". */
export function formatPence(pence: number) {
  const pounds = pence / 100;
  return pence % 100 === 0
    ? wholePoundsFormatter.format(pounds)
    : poundsFormatter.format(pounds);
}
