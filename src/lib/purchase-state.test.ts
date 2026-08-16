import { describe, expect, it } from 'vitest';

import { purchaseStateEnum } from '@/db/schema';

import {
  CLOSED_STATES,
  HOLDING_STATES,
  NEEDS_HUMAN_STATES,
  PAID_STATES,
  PURCHASE_STATES,
  PURCHASE_TRANSITIONS,
  type PurchaseState,
  canTransition,
  isHoldingListing,
  isTerminal,
  needsHuman,
} from './purchase-state';

const partitioned = [
  ...HOLDING_STATES,
  ...PAID_STATES,
  ...CLOSED_STATES,
  ...NEEDS_HUMAN_STATES,
];

describe('the purchase state partition', () => {
  it('covers every value in the database enum', () => {
    // Adding a state without deciding whether it holds a listing, owes money
    // or needs a human should fail here rather than ship.
    expect([...partitioned].sort()).toEqual([...purchaseStateEnum.enumValues].sort());
  });

  it('puts every state in exactly one group', () => {
    expect(new Set(partitioned).size).toBe(partitioned.length);
  });

  it('builds the database enum from the same tuple', () => {
    expect([...purchaseStateEnum.enumValues]).toEqual([...PURCHASE_STATES]);
  });

  it('gives every state a transition list', () => {
    expect(Object.keys(PURCHASE_TRANSITIONS).sort()).toEqual(
      [...PURCHASE_STATES].sort()
    );
  });

  it('only ever transitions to a real state', () => {
    for (const targets of Object.values(PURCHASE_TRANSITIONS)) {
      for (const target of targets) {
        expect(PURCHASE_STATES).toContain(target);
      }
    }
  });
});

describe('the transitions', () => {
  it('lets a held attempt be paid, expire, or be orphaned', () => {
    expect([...PURCHASE_TRANSITIONS.held].sort()).toEqual([
      'expired',
      'orphaned',
      'paid',
    ]);
  });

  it('lets a late payment orphan an already-expired attempt', () => {
    // Stripe will not hold a session open for less than 30 minutes, so a
    // payment landing after a 10-minute hold lapsed is normal, not exotic.
    expect(canTransition('expired', 'orphaned')).toBe(true);
  });

  it('never lets an expired attempt simply become paid', () => {
    // Expired means another buyer took the listing. Accepting the payment
    // here would sell the same place twice.
    expect(canTransition('expired', 'paid')).toBe(false);
  });

  it('never reopens a settled attempt', () => {
    for (const state of ['paid', 'orphaned'] as const) {
      expect(PURCHASE_TRANSITIONS[state]).toEqual([]);
      expect(isTerminal(state)).toBe(true);
    }
  });

  it('never transitions a state to itself', () => {
    for (const state of PURCHASE_STATES) {
      expect(canTransition(state, state)).toBe(false);
    }
  });

  it('reaches every state except the starting one', () => {
    // Nothing in the machine should be unreachable; if a state can never be
    // arrived at, it should not exist.
    const reachable = new Set(Object.values(PURCHASE_TRANSITIONS).flat());
    for (const state of PURCHASE_STATES) {
      if (state === 'held') {
        continue;
      }
      expect(reachable).toContain(state);
    }
  });
});

describe('what the states mean', () => {
  it('treats only a held attempt as holding its listing', () => {
    const holding = PURCHASE_STATES.filter((state: PurchaseState) =>
      isHoldingListing(state)
    );
    expect(holding).toEqual(['held']);
  });

  it('treats only an orphaned attempt as needing a human', () => {
    const flagged = PURCHASE_STATES.filter((state: PurchaseState) =>
      needsHuman(state)
    );
    expect(flagged).toEqual(['orphaned']);
  });

  it('does not consider a paid attempt to be still holding the listing', () => {
    // Payment moves the listing to 'paid' outright; the hold has done its job.
    expect(isHoldingListing('paid')).toBe(false);
  });
});
