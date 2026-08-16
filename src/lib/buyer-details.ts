/**
 * The details a buyer gives so the seller can action the provider's name
 * change.
 *
 * **The field list is still being confirmed** with MSV and No Limits. Full name
 * and email are settled; the rest is not. The shape is therefore versioned:
 * `purchases.buyer_details` is `jsonb` and every row records the version it was
 * written under, so adding a field later needs no migration and does not
 * invalidate rows already stored.
 *
 * Kept free of Zod and server imports so the Client Component can use the
 * length limits. Reading a stored row is a different job with different rules —
 * see `stored-buyer-details.ts`.
 */

/**
 * Bump when the field list changes.
 *
 * `full-name.1` rows exist and carry no email. Anything reading stored details
 * has to tolerate that rather than assume the current shape.
 */
export const BUYER_DETAILS_VERSION = 'full-name-email.1';

export const FULL_NAME_MAX_LENGTH = 120;

/** The longest address RFC 5321 permits. */
export const EMAIL_MAX_LENGTH = 254;

/** The current shape. Widening this means a new version, not an edit. */
export type BuyerDetails = {
  readonly fullName: string;
  readonly email: string;
};
