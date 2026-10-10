import { eq, sql } from 'drizzle-orm';

import { db } from './index';
import { events, listings, purchases } from './schema';

/**
 * Recording a payment, from the Stripe webhook.
 *
 * Every write here is a single conditional statement, for the same two reasons
 * as the claim: the Neon HTTP driver has no transactions, and a webhook is
 * delivered at least once and in no particular order. Conditions on the current
 * state are what make a replay harmless — the second delivery matches nothing
 * and changes nothing, rather than needing a separate "have I seen this?"
 * table to consult and keep in step.
 */

export type PaymentOutcome =
  /** Money in, listing sold. */
  | { readonly kind: 'paid'; readonly purchaseId: string; readonly listingId: string }
  /**
   * Money in for a listing that had already moved on. The buyer paid for
   * something they cannot be given, and is owed a refund by a human.
   */
  | { readonly kind: 'orphaned'; readonly purchaseId: string }
  /** Already recorded. A replay, or two deliveries racing. */
  | { readonly kind: 'already-recorded'; readonly purchaseId: string }
  /** No purchase carries this session id. */
  | { readonly kind: 'unknown-session' };

/**
 * What we know before deciding anything, keyed by the session id Stripe sends.
 *
 * The event date comes along because the transfer deadline is worked out in
 * TypeScript — `transferDeadlineAt` — and stamped at payment rather than
 * derived on every read, so the date quoted to the seller and the one the
 * settlement agent judges against are the same value.
 */
export async function purchaseForSession(stripeSessionId: string) {
  const [row] = await db
    .select({
      id: purchases.id,
      state: purchases.state,
      listingId: purchases.listingId,
      totalInPence: purchases.totalInPence,
      eventDate: events.eventDate,
      currentPurchaseId: listings.currentPurchaseId,
    })
    .from(purchases)
    .innerJoin(listings, eq(purchases.listingId, listings.id))
    .innerJoin(events, eq(listings.eventId, events.id))
    .where(eq(purchases.stripeSessionId, stripeSessionId))
    .limit(1);

  return row ?? null;
}

/**
 * Moves a purchase to `paid` and its listing to sold, in one statement.
 *
 * The listing is the gate, and is written first. Its update carries
 * `current_purchase_id = p.id`, which is the guard that stops a late payment
 * selling a listing somebody else now holds: a session completing after its
 * hold lapsed and the listing was re-claimed matches nothing here.
 *
 * The order is load-bearing. Postgres runs every data-modifying CTE to
 * completion whether or not the outer statement uses its rows, so a purchase
 * update placed in a CTE ahead of the listing would commit `paid` even when the
 * listing guard rejected the payment — and the orphan path, which matches only
 * `held` or `expired`, could then never record it. Driving the purchase update
 * from the listing's `RETURNING` means it cannot run unless the listing moved.
 *
 * `listings.status = 'pending'` reads raw status on purpose, not
 * `buyableListing()`. The question is "does this purchase still own the
 * listing", not "could a new buyer take it": a lapsed hold that nobody
 * re-claimed still points here, and a payment landing in that window is
 * accepted rather than refunded. It also makes a second delivery for the same
 * session a clean no-op — once the first commits, the row-lock re-check sees
 * `paid` and matches nothing.
 *
 * Returns null if nothing moved. `listing-only` means the listing moved but the
 * purchase did not, which should be impossible — the claim changes a purchase
 * only alongside the listing pointer, and nothing else takes a purchase out of
 * `held` while the pointer still names it. It is reported rather than assumed
 * away so the caller can shout.
 */
export async function markPaid(input: {
  readonly stripeSessionId: string;
  readonly amountPaidInPence: number;
  readonly transferDeadlineAt: Date;
}): Promise<{
  readonly kind: 'paid' | 'listing-only';
  readonly purchaseId: string;
  readonly listingId: string;
} | null> {
  const result = await db.execute(sql`
    WITH l AS (
      UPDATE listings
         SET status = 'paid', hold_expires_at = NULL
        FROM purchases p
       WHERE p.stripe_session_id = ${input.stripeSessionId}
         AND p.state = 'held'
         AND listings.id = p.listing_id
         AND listings.current_purchase_id = p.id
         AND listings.status = 'pending'
      RETURNING listings.id AS listing_id, p.id AS purchase_id
    ),
    paid AS (
      UPDATE purchases
         SET state                = 'paid',
             paid_at              = now(),
             amount_paid_in_pence = ${input.amountPaidInPence},
             transfer_deadline_at = ${input.transferDeadlineAt}::timestamptz
        FROM l
       WHERE purchases.id = l.purchase_id
         AND purchases.state = 'held'
      RETURNING purchases.id
    )
    SELECT l.listing_id, l.purchase_id, paid.id AS paid_id
      FROM l
      LEFT JOIN paid ON paid.id = l.purchase_id
  `);

  const [row] = result.rows;
  if (row === undefined) {
    return null;
  }
  return {
    kind: row.paid_id === null ? 'listing-only' : 'paid',
    purchaseId: String(row.purchase_id),
    listingId: String(row.listing_id),
  };
}

/**
 * Records that money arrived for a purchase that can no longer be fulfilled.
 *
 * Deliberately does not touch the listing. Whoever holds it now holds it
 * legitimately, and the person owed something here is the buyer whose payment
 * landed too late — that is a refund, which is a human's decision.
 */
export async function markOrphaned(input: {
  readonly stripeSessionId: string;
  readonly amountPaidInPence: number;
}) {
  const result = await db.execute(sql`
    UPDATE purchases
       SET state                = 'orphaned',
           orphaned_at          = now(),
           amount_paid_in_pence = ${input.amountPaidInPence}
     WHERE stripe_session_id = ${input.stripeSessionId}
       AND state IN ('held', 'expired')
    RETURNING id
  `);

  const [row] = result.rows;
  return row ? String(row.id) : null;
}
