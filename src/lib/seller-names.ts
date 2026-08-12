/**
 * How a seller is named in public, and how many we can look up at once.
 *
 * Pure and Clerk-free on purpose: the rules are the part worth testing, and
 * keeping the SDK out of this module means the tests run in Vitest's node
 * environment with nothing to mock.
 */

/** Shown when a seller has no public name, or their account is gone. */
export const SELLER_FALLBACK_NAME = 'A seller';

/** The only fields we are willing to read. Clerk's `User` satisfies it. */
export type SellerNameFields = {
  readonly username: string | null;
  readonly firstName: string | null;
  /**
   * Set once the seller's Clerk account is deleted. A name may still be
   * stored on a mid-sale listing, kept deliberately as dispute evidence — it
   * simply must not be shown to the public.
   */
  readonly deletedAt?: Date | null;
};

/**
 * Username, else first name, else a neutral fallback.
 *
 * Never the email address, and never the surname — a public listing should
 * disclose neither, which is also why Clerk's `fullName` getter is unused
 * (it is `[firstName, lastName].join(' ')`). Blank strings count as absent:
 * the types say `string | null`, but nothing stops `''`.
 */
export function sellerDisplayName(user: SellerNameFields): string {
  // A deleted account is anonymous regardless of what is still stored. The
  // `user.deleted` webhook erases the name where it is allowed to, but it is
  // forbidden from touching mid-sale rows, so those keep a name that must not
  // be rendered.
  if (user.deletedAt) {
    return SELLER_FALLBACK_NAME;
  }

  const username = user.username?.trim();
  if (username) {
    return username;
  }

  const firstName = user.firstName?.trim();
  if (firstName) {
    return firstName;
  }

  return SELLER_FALLBACK_NAME;
}

