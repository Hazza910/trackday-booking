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

/**
 * The buyer's fee, on top of the seller's asking price and shown as its own
 * line: £100 + £5 = £105. The seller's own 5% comes off at payout, which is a
 * later chapter.
 */
export const BUYER_FEE_PERCENT = 5;

/**
 * Rounded half-up to the penny. 5% of a whole-pence price is not always whole
 * pence, and somebody has to absorb the fraction — half-up puts it on the
 * platform's side of the line as often as the buyer's.
 *
 * The multiplication runs before the division so the intermediate value is an
 * exact integer; only the final division can land on a fraction, and the .5
 * cases it produces are exactly representable in binary, so `Math.round` sees
 * the value it should.
 */
export function buyerFeeInPence(askingPriceInPence: number) {
  if (!Number.isSafeInteger(askingPriceInPence) || askingPriceInPence < 0) {
    // Not user input — prices are validated into pence long before this — so a
    // bad value here is a programming error, and rounding it silently would
    // put a wrong number in front of a buyer.
    throw new Error(
      `buyerFeeInPence: expected non-negative integer pence, got ${askingPriceInPence}`
    );
  }

  return Math.round((askingPriceInPence * BUYER_FEE_PERCENT) / 100);
}

/** What the buyer is actually charged. */
export function buyerTotalInPence(askingPriceInPence: number) {
  return askingPriceInPence + buyerFeeInPence(askingPriceInPence);
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
