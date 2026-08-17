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
 * The listing update carries `current_purchase_id = p.id`, which is the guard
 * that stops a late payment selling a listing somebody else now holds. Without
 * it, a session completing after its hold lapsed would take a listing that had
 * already been re-claimed and hand it to the wrong buyer.
 *
 * Returns zero rows if the purchase is no longer `held`, or if the listing has
 * moved on — the caller decides which, because those mean very different
 * things.
 */
export async function markPaid(input: {
  readonly stripeSessionId: string;
  readonly amountPaidInPence: number;
  readonly transferDeadlineAt: Date;
}) {
  const result = await db.execute(sql`
    WITH p AS (
      UPDATE purchases
         SET state                = 'paid',
             paid_at              = now(),
             amount_paid_in_pence = ${input.amountPaidInPence},
             transfer_deadline_at = ${input.transferDeadlineAt}::timestamptz
       WHERE stripe_session_id = ${input.stripeSessionId}
         AND state = 'held'
      RETURNING id, listing_id
    )
    UPDATE listings
       SET status = 'paid', hold_expires_at = NULL
      FROM p
     WHERE listings.id = p.listing_id
       AND listings.current_purchase_id = p.id
    RETURNING listings.id AS listing_id, p.id AS purchase_id
  `);

  const [row] = result.rows;
  return row
    ? {
        purchaseId: String(row.purchase_id),
        listingId: String(row.listing_id),
      }
    : null;
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
