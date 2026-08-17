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

  // Still held — but only pay out if the listing agrees. It may have been
  // withdrawn or sold by another route, which leaves this row untouched at
  // `held` while the pointer has moved or gone.
  return context.currentPurchaseId === context.purchaseId ? 'pay' : 'orphan';
}
