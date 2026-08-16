/**
 * The state machine for one attempt to buy a listing.
 *
 * Written to be read by something other than a person. The Phase 3 settlement
 * agent has to decide, from a row alone, whether an attempt is holding a
 * listing, owes somebody money, or needs a human — so each state answers those
 * questions explicitly instead of leaving them to be inferred from which
 * timestamps happen to be null.
 *
 * Kept as an exhaustive partition in the same shape as `listing-status.ts`:
 * `purchase-state.test.ts` fails if a state belongs to no group or to two, so
 * adding one to the enum forces the decision rather than allowing it to be
 * quietly swept in with the rest.
 */

/** The enum's values. `src/db/schema.ts` builds the pg enum from this tuple. */
export const PURCHASE_STATES = ['held', 'paid', 'expired', 'orphaned'] as const;

export type PurchaseState = (typeof PURCHASE_STATES)[number];

/**
 * A claim on the listing is in flight. Whether that claim is still *live* is a
 * separate question — see `isHoldLive` in `hold.ts`. A lapsed hold stays
 * `held` until another buyer's claim tidies it up.
 */
export const HOLDING_STATES = ['held'] as const;

/** Money arrived and the sale is proceeding. */
export const PAID_STATES = ['paid'] as const;

/** Over, with nothing owed in either direction. */
export const CLOSED_STATES = ['expired'] as const;

/**
 * Money arrived for a listing that had already moved on — the buyer paid for
 * something they cannot be given. Owed a refund, by a human.
 */
export const NEEDS_HUMAN_STATES = ['orphaned'] as const;

/**
 * What may follow what.
 *
 * `held → orphaned` and `expired → orphaned` are both reachable and are not the
 * same event. A Stripe Checkout session cannot be told to live for only ten
 * minutes — Stripe's floor is thirty — so a payment can always land after the
 * hold that justified it has lapsed. If nobody else claimed the listing in the
 * meantime the attempt is still `held` and the payment is simply accepted; if
 * somebody did, the claim moved this row to `expired` first, and the late
 * payment has nowhere to go.
 *
 * `paid` and `orphaned` are terminal for now. The transfer chapter adds what
 * follows `paid`, and refunds add what follows `orphaned`.
 */
export const PURCHASE_TRANSITIONS: Readonly<
  Record<PurchaseState, readonly PurchaseState[]>
> = {
  held: ['paid', 'expired', 'orphaned'],
  expired: ['orphaned'],
  paid: [],
  orphaned: [],
};

export function canTransition(from: PurchaseState, to: PurchaseState) {
  return PURCHASE_TRANSITIONS[from].includes(to);
}

function isIn(states: readonly PurchaseState[], state: PurchaseState) {
  return states.some((value) => value === state);
}

/** Does this attempt still have a claim on its listing? */
export function isHoldingListing(state: PurchaseState) {
  return isIn(HOLDING_STATES, state);
}

/** Is this attempt finished, with nothing left for anyone to do? */
export function isTerminal(state: PurchaseState) {
  return PURCHASE_TRANSITIONS[state].length === 0;
}

/** Does this attempt need a person to look at it? */
export function needsHuman(state: PurchaseState) {
  return isIn(NEEDS_HUMAN_STATES, state);
}
