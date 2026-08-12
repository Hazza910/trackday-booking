import { z } from 'zod';

import {
  checkForContactDetails,
  describeContactFilterReasons,
} from './contact-filter';
import { GROUP_LEVELS } from './group-levels';
import { NOTES_MAX_LENGTH, type ListingFieldName } from './listing-form-state';
import {
  MAX_PRICE_IN_PENCE,
  MIN_PRICE_IN_PENCE,
  formatPence,
  parsePoundsToPence,
} from './money';

/**
 * Validation for a new listing. Everything a seller submits passes through
 * here, on the server — the form's own attributes are a convenience, never a
 * guarantee.
 */

/**
 * Prices arrive as pounds and leave as integer pence.
 *
 * One transform rather than a chain of refinements, so exactly one message
 * surfaces per field and the order (missing, then malformed, then out of
 * range) is explicit. Bounds are checked in pence, where the value is exact,
 * but every message is phrased in pounds — a seller should never see the word
 * "pence".
 */
function priceInPounds(label: string) {
  return z.string(`Enter the ${label} in pounds.`).transform((raw, ctx) => {
    const parsed = parsePoundsToPence(raw);

    if (!parsed.ok) {
      ctx.addIssue({
        code: 'custom',
        message:
          parsed.reason === 'empty'
            ? `Enter the ${label} in pounds.`
            : `Enter the ${label} in pounds, like 120 or 120.50.`,
      });
      return z.NEVER;
    }
    if (parsed.pence < MIN_PRICE_IN_PENCE) {
      ctx.addIssue({
        code: 'custom',
        message: `The ${label} must be at least ${formatPence(MIN_PRICE_IN_PENCE)}.`,
      });
      return z.NEVER;
    }
    if (parsed.pence > MAX_PRICE_IN_PENCE) {
      ctx.addIssue({
        code: 'custom',
        message: `The ${label} must be no more than ${formatPence(MAX_PRICE_IN_PENCE)}.`,
      });
      return z.NEVER;
    }

    return parsed.pence;
  });
}

export const listingInputSchema = z.object({
  eventId: z.uuid('Choose an event from the list.'),
  groupLevel: z.enum(GROUP_LEVELS, 'Choose the group your place is booked into.'),
  askingPrice: priceInPounds('asking price'),
  originalPrice: priceInPounds('price you paid'),
  // Deliberately not run through the contact filter: provider references are
  // often an unbroken run of eight digits, which the filter reads as an
  // account number. It is never shown to anyone but the seller.
  bookingReference: z
    .string('Enter the booking reference from your provider.')
    .trim()
    .min(3, 'Enter the booking reference from your provider.')
    .max(64, 'That booking reference is too long.'),
  notes: z.string().transform((raw, ctx) => {
    const value = raw.trim();

    if (value.length === 0) {
      return null;
    }
    if (value.length > NOTES_MAX_LENGTH) {
      ctx.addIssue({
        code: 'custom',
        message: `Notes must be ${NOTES_MAX_LENGTH} characters or fewer.`,
      });
      return z.NEVER;
    }

    const contactCheck = checkForContactDetails(value);
    if (!contactCheck.ok) {
      ctx.addIssue({
        code: 'custom',
        message: describeContactFilterReasons(contactCheck),
      });
      return z.NEVER;
    }

    return value;
  }),
});

export type ListingInput = z.infer<typeof listingInputSchema>;

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/**
 * Compile-time proof that the schema's fields and the form's field names are
 * the same set. Exported so it counts as used; it can only be `true` when the
 * two agree.
 */
export const LISTING_FIELDS_MATCH_SCHEMA: Exact<
  keyof z.input<typeof listingInputSchema>,
  ListingFieldName
> = true;
