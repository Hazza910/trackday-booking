/**
 * How a seller is named in public, and how many we can look up at once.
 *
 * Pure and Clerk-free on purpose: the rules are the part worth testing, and
 * keeping the SDK out of this module means the tests run in Vitest's node
 * environment with nothing to mock.
 */

/** Shown when a seller has no public name, or Clerk cannot be reached. */
export const SELLER_FALLBACK_NAME = 'A seller';

/**
 * Clerk's hard cap: `UserListParams.userId` is documented as "Accepts up to
 * 100 user IDs". It is also the `limit` we must pass — that parameter
 * defaults to 10, so a full batch would otherwise resolve only ten sellers.
 */
export const CLERK_USER_ID_BATCH = 100;

/** The only fields we are willing to read. Clerk's `User` satisfies it. */
export type SellerNameFields = {
  readonly username: string | null;
  readonly firstName: string | null;
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

/** De-duplicates, preserves first-seen order, splits into request-sized batches. */
export function chunkUserIds(
  ids: readonly string[],
  size: number = CLERK_USER_ID_BATCH
): string[][] {
  const distinct = [...new Set(ids)];
  const chunks: string[][] = [];

  for (let index = 0; index < distinct.length; index += size) {
    chunks.push(distinct.slice(index, index + size));
  }

  return chunks;
}
