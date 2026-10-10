import type { PurchaseState } from './purchase-state';

/**
 * What to do with a completed Stripe session, decided from state alone.
 *
 * Pulled out of the webhook so the branch table can be tested exhaustively
 * without a database or a signed request — the same reason `deletionPolicyFor`
 * exists. Getting this wrong in either direction is expensive: paying out a
 * listing somebody else holds sells one place twice, and orphaning a good
 * payment tells a buyer who paid correctly that they need a refund.
 */

export type PaymentDecision =
  /** Money in, listing sold to this buyer. */
  | 'pay'
  /** Money in for a listing that has moved on. A human owes a refund. */
  | 'orphan'
  /** Nothing to do — a replay, or two deliveries racing. */
  | 'already-recorded';

export type PaymentContext = {
  readonly state: PurchaseState;
  readonly purchaseId: string;
  /** What the listing currently points at; null when nothing holds it. */
  readonly currentPurchaseId: string | null;
  /**
   * Whether the track day is already over when the money lands — the same
   * `eventDate < todayIso()` test the buy action uses to refuse a claim.
   */
  readonly eventIsPast: boolean;
};

export function decidePayment(context: PaymentContext): PaymentDecision {
  // Terminal states first. Stripe delivers at least once, so a second delivery
  // for a purchase already settled is ordinary traffic, not a fault.
  if (context.state === 'paid' || context.state === 'orphaned') {
    return 'already-recorded';
  }

  // A later claim expired this attempt, which means another buyer took the
  // listing. The payment arrived too late whatever the listing says now.
  if (context.state === 'expired') {
    return 'orphan';
  }

  // Money for a day that has already happened. A card payment gets here only
  // by straddling midnight — the buy action refuses past events and a session
  // lives thirty minutes — but a delayed method such as Bacs can confirm days
  // after checkout, and nobody can be given a place on a day that is over. A
  // refund, not a sale.
  if (context.eventIsPast) {
    return 'orphan';
  }

  // Still held — but only pay out if the listing agrees. It may have been
  // withdrawn or sold by another route, which leaves this row untouched at
  // `held` while the pointer has moved or gone.
  return context.currentPurchaseId === context.purchaseId ? 'pay' : 'orphan';
}

/**
 * What a Stripe event means for us, before any purchase is looked up.
 *
 * `checkout.session.completed` does not mean money arrived. With a delayed
 * payment method — Bacs, Pay by Bank — the session completes with
 * `payment_status = 'unpaid'` and the money is confirmed days later by
 * `checkout.session.async_payment_succeeded`. Recording a payment on the first
 * would sell the place before it was paid for. Checkout's payment methods come
 * from the Dashboard rather than from `checkout-session.ts`, so whether delayed
 * methods are on is not something this code controls.
 *
 * Anything else is `unexpected`, which the route logs loudly rather than
 * acknowledging in silence. The endpoint subscribes to these three types only,
 * so a different type arriving means its subscriptions are misconfigured.
 */
export type EventDecision =
  | 'record-payment'
  | 'awaiting-async-payment'
  | 'async-payment-failed'
  | 'unexpected';

export function decideEvent(
  type: string,
  paymentStatus: string | null
): EventDecision {
  switch (type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      // Only `paid` is money. `no_payment_required` cannot happen for a
      // non-zero total, and is not treated as payment if it ever does.
      return paymentStatus === 'paid'
        ? 'record-payment'
        : 'awaiting-async-payment';
    case 'checkout.session.async_payment_failed':
      return 'async-payment-failed';
    default:
      return 'unexpected';
  }
}
