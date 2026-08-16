import { and, eq, lte, or, sql } from 'drizzle-orm';

import { listings } from './schema';

/**
 * The SQL half of the buyability rule.
 *
 * Its TypeScript twin is `isBuyable` in src/lib/hold.ts, and the two have to
 * give the same answer for every row — a listing the board offers but the
 * claim refuses is a dead Buy button, and one the claim accepts but the board
 * hides is a place nobody can find. Changing either means changing both.
 *
 * Three details are load-bearing:
 *
 * - `<=`, not `<`. A hold expiring at exactly `now` is over, on both sides.
 * - A NULL `hold_expires_at` fails the comparison, because `NULL <= now()` is
 *   NULL and a WHERE clause does not treat that as true. So a pending listing
 *   with no expiry is *not* offered — which is the safe reading, and is why
 *   `isHoldExpired` is deliberately not the negation of `isHoldLive`.
 * - Every column referenced belongs to `listings`. The claim evaluates this
 *   same rule inside a conditional UPDATE, where Postgres' lock on that single
 *   row is the whole of the double-sell protection; a predicate needing a join
 *   could not live there.
 *
 * A function rather than a constant so each caller composes a fresh expression
 * and nothing is shared between query builders.
 */
export function buyableListing() {
  return or(
    eq(listings.status, 'active'),
    // The lazy release: nothing sweeps expired holds, so a listing whose hold
    // has run out is simply offered again, and the next claim is what actually
    // moves it back.
    and(eq(listings.status, 'pending'), lte(listings.holdExpiresAt, sql`now()`))
  );
}
