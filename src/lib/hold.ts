/**
 * The buyer's hold on a listing.
 *
 * A hold is released lazily. Nothing sweeps expired holds: the board treats a
 * pending listing whose hold has lapsed as available again, and the next
 * buyer's claim is what actually flips it back. That means the *same* rule has
 * to be applied by the read paths in TypeScript and by the claim in SQL, and
 * the two must agree exactly — including on the tie.
 *
 * The tie is settled here: a hold expiring at precisely `now` is **over**.
 * The SQL mirror is therefore `hold_expires_at <= now()`, never `<`.
 */

/** Ten minutes from the Buy click. */
export const HOLD_DURATION_MS = 10 * 60 * 1000;

export function holdExpiresAt(from: Date) {
  return new Date(from.getTime() + HOLD_DURATION_MS);
}

/**
 * Is a hold still running? Null means no hold was ever taken, which is not a
 * live one.
 */
export function isHoldLive(expiresAt: Date | null, now: Date) {
  return expiresAt !== null && expiresAt.getTime() > now.getTime();
}

/**
 * Has a hold run out?
 *
 * Deliberately **not** the negation of `isHoldLive`. A null expiry is neither
 * live nor expired, which is the same three-valued answer SQL gives: the
 * mirror of this is `hold_expires_at <= now()`, and with a NULL that evaluates
 * to NULL, which a WHERE clause does not treat as true.
 *
 * Modelling it as "not live" instead would make a pending listing with no
 * expiry look claimable to the read paths while the claim's own predicate
 * refused it — a disagreement that only shows up on a row that should never
 * exist, which is the worst possible time to find out about it.
 */
export function isHoldExpired(expiresAt: Date | null, now: Date) {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}

/** How long a live hold has left, floored at zero. */
export function holdRemainingMs(expiresAt: Date | null, now: Date) {
  if (expiresAt === null) {
    return 0;
  }
  return Math.max(0, expiresAt.getTime() - now.getTime());
}

/**
 * The listing columns the claim's predicate is allowed to look at. Narrowed to
 * exactly these two on purpose — the guard is a conditional UPDATE on one
 * `listings` row, and Postgres' lock on that row is what serialises two buyers
 * racing. A predicate that needed anything else could not be evaluated there.
 */
export type BuyableListing = {
  readonly status: string;
  readonly holdExpiresAt: Date | null;
};

/**
 * Can this listing be claimed right now?
 *
 * The TypeScript half of the rule. Its SQL mirror lands with the read paths:
 *
 *   status = 'active' OR (status = 'pending' AND hold_expires_at <= now())
 *
 * Any change here is a change there.
 */
export function isBuyable(listing: BuyableListing, now: Date) {
  if (listing.status === 'active') {
    return true;
  }

  return (
    listing.status === 'pending' && isHoldExpired(listing.holdExpiresAt, now)
  );
}

/**
 * Is somebody else part-way through buying this? The state a race loser sees,
 * and the reason it is distinct from "sold": the hold may yet lapse.
 *
 * Defined as "pending, and not demonstrably expired" so that the pair of
 * functions covers every pending row between them. A pending listing with no
 * expiry at all should not exist — a claim writes both columns in one
 * statement — but if one ever does, it reads as somebody mid-purchase rather
 * than as a listing free to be sold a second time.
 */
export function isHeldByAnother(listing: BuyableListing, now: Date) {
  return (
    listing.status === 'pending' && !isHoldExpired(listing.holdExpiresAt, now)
  );
}
