import { and, eq, gt, lte, or, sql } from 'drizzle-orm';

import { listings, purchases } from './schema';

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

/**
 * A listing the given viewer is currently holding.
 *
 * The complement of `buyableListing()` from one person's point of view: that
 * predicate correctly hides a held listing from everyone, which also hid it
 * from the one person who most needed to find it. Requires a join to
 * `purchases` on `listings.current_purchase_id`.
 *
 * Returns undefined for a signed-out viewer, which drizzle drops from the
 * surrounding `or()` — so an anonymous reader sees exactly what they did
 * before, with no extra clause and no way to probe for somebody else's hold.
 */
function viewerHoldsIt(viewerId: string) {
  return and(
    eq(purchases.buyerId, viewerId),
    eq(purchases.state, 'held'),
    // `>` not `>=`, the mirror of the expiry rule: a hold ending exactly now is
    // over, and this listing is buyable again rather than still theirs.
    gt(purchases.holdExpiresAt, sql`now()`)
  );
}

export function heldByViewer(viewerId: string | null) {
  if (viewerId === null) {
    return undefined;
  }

  return and(eq(listings.status, 'pending'), viewerHoldsIt(viewerId));
}

/**
 * The same question as a selectable boolean, for deciding how to render a row.
 *
 * Built from the same conditions as the predicate above rather than a second
 * copy, because the two disagreeing is a specific and ugly bug: a lapsed hold
 * of the viewer's own would come back through `buyableListing()` and then be
 * captioned "you're part-way through buying this — expired".
 *
 * A boolean, never the buyer's id: a lapsed-hold listing is returned to
 * everyone, and the previous holder's Clerk id has no business travelling to a
 * public page even unrendered.
 */
export function viewerHoldsItColumn(viewerId: string | null) {
  return viewerId === null
    ? sql<boolean>`false`
    : sql<boolean>`${viewerHoldsIt(viewerId)}`;
}
