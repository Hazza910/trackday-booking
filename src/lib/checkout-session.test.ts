import { describe, expect, it } from 'vitest';

import {
  SESSION_LIFETIME_SECONDS,
  checkoutSessionParams,
} from './checkout-session';
import { buyerFeeInPence, buyerTotalInPence } from './money';

const input = {
  purchaseId: '00000000-0000-4000-8000-000000000000',
  askingPriceInPence: 13_500,
  buyerFeeInPence: 675,
  returnUrl: 'https://www.thepaddockboard.com/purchases/x?session_id={CHECKOUT_SESSION_ID}',
  nowSeconds: 1_800_000_000,
};

describe('checkoutSessionParams', () => {
  it('uses embedded_page, not embedded', () => {
    // Pinned deliberately. Stripe types `ui_mode` with an `OtherString` escape
    // hatch, so every string type-checks and a wrong value survives `tsc`
    // untouched — the API rejects `embedded` outright with a 400, which is the
    // only place it shows up. This test is the compiler we do not get.
    expect(checkoutSessionParams(input).ui_mode).toBe('embedded_page');
  });

  it('bills the price and the fee as separate lines', () => {
    const items = checkoutSessionParams(input).line_items ?? [];
    expect(items).toHaveLength(2);
    expect(items[0]?.price_data?.unit_amount).toBe(13_500);
    expect(items[1]?.price_data?.unit_amount).toBe(675);
  });

  it('charges exactly the buyer total', () => {
    const items = checkoutSessionParams(input).line_items ?? [];
    const charged = items.reduce(
      (total, item) => total + (item.price_data?.unit_amount ?? 0),
      0
    );
    expect(charged).toBe(buyerTotalInPence(13_500));
    expect(charged).toBe(14_175);
  });

  it('agrees with the fee the buyer was quoted', () => {
    // The quote on the buy page and the amount Stripe collects come from
    // different code paths; they must not be able to drift apart.
    for (const asking of [1_000, 12_345, 13_500, 100_000]) {
      const items = checkoutSessionParams({
        ...input,
        askingPriceInPence: asking,
        buyerFeeInPence: buyerFeeInPence(asking),
      }).line_items ?? [];
      const charged = items.reduce(
        (total, item) => total + (item.price_data?.unit_amount ?? 0),
        0
      );
      expect(charged).toBe(buyerTotalInPence(asking));
    }
  });

  it('prices in pounds sterling', () => {
    for (const item of checkoutSessionParams(input).line_items ?? []) {
      expect(item.price_data?.currency).toBe('gbp');
    }
  });

  it('names the fee so the buyer can check it', () => {
    const items = checkoutSessionParams(input).line_items ?? [];
    expect(items[1]?.price_data?.product_data?.name).toBe(
      'Buyer fee (5% of £135)'
    );
  });

  it('carries the purchase id for the webhook', () => {
    // The webhook finds the purchase through this rather than through anything
    // the browser hands back.
    expect(checkoutSessionParams(input).metadata).toEqual({
      purchaseId: input.purchaseId,
    });
  });

  it("lives for Stripe's 30-minute floor", () => {
    expect(SESSION_LIFETIME_SECONDS).toBe(1_800);
    expect(checkoutSessionParams(input).expires_at).toBe(
      input.nowSeconds + 1_800
    );
  });

  it('outlives the hold, which is why orphaned payments exist', () => {
    // Stripe will not accept a session shorter than 30 minutes and the hold is
    // 10, so a payment can always land after the hold lapsed. Asserting the
    // inequality keeps the reasoning attached to the numbers.
    expect(SESSION_LIFETIME_SECONDS * 1_000).toBeGreaterThan(10 * 60 * 1_000);
  });

  it('keeps the session-id placeholder in the return url', () => {
    // Stripe substitutes this; losing it would send the buyer back with no way
    // to tell the page which session completed.
    expect(checkoutSessionParams(input).return_url).toContain(
      '{CHECKOUT_SESSION_ID}'
    );
  });
});
