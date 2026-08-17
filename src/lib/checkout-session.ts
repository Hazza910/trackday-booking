import type Stripe from 'stripe';

import { formatPence } from './money';

/**
 * The Stripe Checkout session a purchase turns into.
 *
 * Pure, and separate from the action that sends it, for two reasons: it can be
 * unit-tested, and it can be handed to Stripe by a verification script without
 * anybody re-typing the parameters into a second copy that then drifts from
 * this one.
 */

/**
 * How long Stripe will hold the session open.
 *
 * 30 minutes is Stripe's own floor — it will not accept less. Our hold is ten,
 * so a session can outlive the hold that justified it, and a payment can land
 * after another buyer has taken the listing. That is the whole reason the
 * `orphaned` purchase state exists: Stripe does not permit it to be designed
 * away here.
 */
export const SESSION_LIFETIME_SECONDS = 30 * 60;

export type CheckoutSessionInput = {
  readonly purchaseId: string;
  readonly askingPriceInPence: number;
  readonly buyerFeeInPence: number;
  readonly returnUrl: string;
  /** Unix seconds. Passed in so the result is deterministic to test. */
  readonly nowSeconds: number;
};

export function checkoutSessionParams(
  input: CheckoutSessionInput
): Stripe.Checkout.SessionCreateParams {
  return {
    /**
     * `embedded_page`, not `embedded`. The older value is rejected outright by
     * the current API, and **the compiler cannot help here**: Stripe types this
     * union with an `OtherString` escape hatch, so every string passes
     * type-checking and a wrong value is only found by calling the API. There
     * is a test below pinning this exact string for that reason.
     */
    ui_mode: 'embedded_page',
    mode: 'payment',
    expires_at: input.nowSeconds + SESSION_LIFETIME_SECONDS,
    // Two line items rather than one total: the buyer sees what the seller
    // asked for and what we added, on Stripe's form as well as on ours.
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'gbp',
          unit_amount: input.askingPriceInPence,
          product_data: { name: 'Track day place' },
        },
      },
      {
        quantity: 1,
        price_data: {
          currency: 'gbp',
          unit_amount: input.buyerFeeInPence,
          product_data: {
            name: `Buyer fee (5% of ${formatPence(input.askingPriceInPence)})`,
          },
        },
      },
    ],
    // The webhook finds the purchase through this, so it is set at creation and
    // never derived from anything the browser sends back.
    metadata: { purchaseId: input.purchaseId },
    return_url: input.returnUrl,
  };
}
