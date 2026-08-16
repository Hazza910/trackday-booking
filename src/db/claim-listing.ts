import { and, eq, sql } from 'drizzle-orm';

import { CONSENT_VERSION } from '@/lib/consent';
import { BUYER_DETAILS_VERSION, type BuyerDetails } from '@/lib/buyer-details';
import { HOLD_DURATION_MS } from '@/lib/hold';

import { db } from './index';
import { listings, purchases } from './schema';

/**
 * Who is holding this listing right now, if anyone.
 *
 * Read through `listings.current_purchase_id` rather than by searching
 * `purchases` for a held row, because the pointer is what the claim maintains
 * and what the payment path checks against — asking the same question a
 * different way is how two answers start to diverge.
 *
 * Returns the row whatever state it is in; whether the hold is still live is
 * `isHoldLive`'s business, and the caller has the expiry to hand.
 */
export async function currentHolder(listingId: string) {
  const [holder] = await db
    .select({
      purchaseId: purchases.id,
      buyerId: purchases.buyerId,
      state: purchases.state,
      holdExpiresAt: purchases.holdExpiresAt,
    })
    .from(listings)
    .innerJoin(purchases, eq(purchases.id, listings.currentPurchaseId))
    .where(eq(listings.id, listingId))
    .limit(1);

  return holder ?? null;
}

/**
 * The buyer's own live hold on this listing, if they have one.
 *
 * Used to send somebody back to the purchase they already started instead of
 * telling them a listing is being bought when the person buying it is them.
 */
export async function ownLiveHold(listingId: string, buyerId: string) {
  const [held] = await db
    .select({ purchaseId: purchases.id, holdExpiresAt: purchases.holdExpiresAt })
    .from(listings)
    .innerJoin(purchases, eq(purchases.id, listings.currentPurchaseId))
    .where(
      and(
        eq(listings.id, listingId),
        eq(purchases.buyerId, buyerId),
        eq(purchases.state, 'held'),
        // The same tie as everywhere else: an expiry of exactly now is over.
        sql`${purchases.holdExpiresAt} > now()`
      )
    )
    .limit(1);

  return held ?? null;
}

/**
 * Takes a buyer's hold on a listing, or fails because somebody else got there
 * first.
 *
 * This is the double-sell guard, and it is one statement because it has to be
 * atomic and the Neon HTTP driver has no transactions (see CLAUDE.md). What
 * makes it safe is the conditional UPDATE on a single `listings` row: two
 * buyers racing serialise on Postgres' row lock, the loser re-evaluates the
 * predicate against the winner's committed row, and fails it. Zero rows back
 * means the race was lost.
 *
 * Three details that are easy to get wrong, and were:
 *
 * - `old.current_purchase_id`. `RETURNING` gives *post*-update values by
 *   default, so reading it unqualified would hand back the id being written on
 *   this very line, and `released` would expire nothing. PostgreSQL 18 added
 *   the `old` prefix; Neon runs 18.4.
 * - `hold_expires_at` is carried out of `claimed` into the INSERT rather than
 *   recomputed. Writing `now() + …` twice would be correct — `now()` is the
 *   transaction timestamp — but correct by two expressions happening to match,
 *   which is not a property worth depending on.
 * - The hold length is a parameter, so the ten minutes lives only in
 *   `HOLD_DURATION_MS`, while `now()` stays the database's clock. Deriving the
 *   expiry from the app's clock would make the guard sensitive to skew between
 *   Vercel and Neon.
 *
 * `released` is bookkeeping, not the source of truth: it tidies the previous
 * holder's row to `expired`, but nothing depends on it having run, because a
 * lapsed hold is recognised by `hold_expires_at`, not by the state column.
 */

export type ClaimResult =
  | { readonly ok: true; readonly purchaseId: string; readonly holdExpiresAt: Date }
  | { readonly ok: false };

export type ClaimInput = {
  readonly listingId: string;
  readonly buyerId: string;
  /**
   * The price the buyer was quoted. Guards the claim rather than being
   * written blindly: the fee and total were worked out from a price read a
   * moment ago, so if it has moved the claim must fail rather than store a
   * row whose fee does not match its price.
   */
  readonly askingPriceInPence: number;
  readonly buyerFeeInPence: number;
  readonly totalInPence: number;
  readonly riskWarningRequired: boolean;
  /** Null when the warning was not required — never when it was. */
  readonly riskAcceptedAt: Date | null;
  readonly buyerDetails: BuyerDetails;
};

export async function claimListing(input: ClaimInput): Promise<ClaimResult> {
  // Generated here rather than by the column default so the same value can be
  // written into `listings.current_purchase_id` in the same statement.
  const purchaseId = crypto.randomUUID();
  const holdSeconds = HOLD_DURATION_MS / 1000;

  const result = await db.execute(sql`
    WITH claimed AS (
      UPDATE listings
         SET status              = 'pending',
             hold_expires_at     = now() + make_interval(secs => ${holdSeconds}::double precision),
             current_purchase_id = ${purchaseId}::uuid
       WHERE id = ${input.listingId}::uuid
         AND asking_price_in_pence = ${input.askingPriceInPence}
         AND (status = 'active' OR (status = 'pending' AND hold_expires_at <= now()))
      RETURNING id,
                asking_price_in_pence,
                hold_expires_at,
                old.current_purchase_id AS previous
    ),
    released AS (
      UPDATE purchases
         SET state = 'expired', expired_at = now()
        FROM claimed
       WHERE purchases.id = claimed.previous
         AND purchases.state = 'held'
    )
    INSERT INTO purchases (
      id, listing_id, buyer_id,
      asking_price_in_pence, buyer_fee_in_pence, total_in_pence,
      risk_warning_required, final_sale_accepted_at, risk_accepted_at,
      consent_version, buyer_details, buyer_details_version,
      hold_expires_at
    )
    SELECT ${purchaseId}::uuid,
           claimed.id,
           ${input.buyerId},
           claimed.asking_price_in_pence,
           ${input.buyerFeeInPence},
           ${input.totalInPence},
           ${input.riskWarningRequired},
           now(),
           ${input.riskAcceptedAt}::timestamptz,
           ${CONSENT_VERSION},
           ${JSON.stringify(input.buyerDetails)}::jsonb,
           ${BUYER_DETAILS_VERSION},
           claimed.hold_expires_at
      FROM claimed
    RETURNING id, hold_expires_at
  `);

  const [row] = result.rows;
  if (row === undefined) {
    // Lost the race, or the price moved underneath the quote. Either way the
    // buyer gets the same answer: somebody else is buying this.
    return { ok: false };
  }

  return {
    ok: true,
    purchaseId,
    holdExpiresAt: new Date(String(row.hold_expires_at)),
  };
}
