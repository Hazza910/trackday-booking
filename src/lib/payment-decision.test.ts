import { describe, expect, it } from 'vitest';

import { decidePayment } from './payment-decision';
import { PURCHASE_STATES, type PurchaseState } from './purchase-state';

const MINE = '11111111-1111-4111-8111-111111111111';
const THEIRS = '22222222-2222-4222-8222-222222222222';

const context = (state: PurchaseState, currentPurchaseId: string | null) => ({
  state,
  purchaseId: MINE,
  currentPurchaseId,
});

describe('decidePayment', () => {
  it('pays a held purchase whose listing still points at it', () => {
    expect(decidePayment(context('held', MINE))).toBe('pay');
  });

  it('orphans a held purchase whose listing points elsewhere', () => {
    // The listing was withdrawn or sold by another route, which leaves this
    // row at `held` while the pointer moved. Paying out here would sell one
    // place twice.
    expect(decidePayment(context('held', THEIRS))).toBe('orphan');
  });

  it('orphans a held purchase whose listing points at nothing', () => {
    expect(decidePayment(context('held', null))).toBe('orphan');
  });

  it('orphans an expired purchase however the listing looks', () => {
    // Expired means a later claim took the listing. The payment is late
    // whatever the pointer says now — including the case where the new holder
    // has since gone away and left it null.
    for (const pointer of [MINE, THEIRS, null]) {
      expect(decidePayment(context('expired', pointer))).toBe('orphan');
    }
  });

  it.each(['paid', 'orphaned'] as const)(
    'treats a second delivery for a %s purchase as already recorded',
    (state) => {
      // Stripe delivers at least once. A replay is ordinary traffic, not a
      // fault, and must not be able to move anything a second time.
      for (const pointer of [MINE, THEIRS, null]) {
        expect(decidePayment(context(state, pointer))).toBe('already-recorded');
      }
    }
  );

  it('decides something for every state in the enum', () => {
    // Adding a purchase state without deciding what a completed payment means
    // for it should fail here rather than silently fall through to a default.
    for (const state of PURCHASE_STATES) {
      expect(['pay', 'orphan', 'already-recorded']).toContain(
        decidePayment(context(state, MINE))
      );
    }
  });

  it('only ever pays out from held', () => {
    // The one transition that moves money to a seller. Nothing else may reach
    // it, whatever the listing pointer happens to say.
    for (const state of PURCHASE_STATES) {
      for (const pointer of [MINE, THEIRS, null]) {
        if (decidePayment(context(state, pointer)) === 'pay') {
          expect(state).toBe('held');
          expect(pointer).toBe(MINE);
        }
      }
    }
  });
});
