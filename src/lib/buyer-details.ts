/**
 * The details a buyer gives so the seller can action the provider's name
 * change.
 *
 * **The real field list is not settled yet** — what MSV and No Limits require
 * is still being confirmed. So this is deliberately one field, and the shape is
 * versioned: `purchases.buyer_details` is `jsonb` and every row records the
 * version it was written under, so adding fields later does not invalidate
 * rows already stored or need a migration to read them.
 *
 * Kept free of Zod and server imports so the Client Component can use the
 * length limits.
 */

/** Bump when the field list changes. */
export const BUYER_DETAILS_VERSION = 'full-name.1';

export const FULL_NAME_MAX_LENGTH = 120;

/** The v1 shape. Widening this means a new version, not an edit. */
export type BuyerDetails = {
  readonly fullName: string;
};
