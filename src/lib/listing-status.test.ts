import { describe, expect, it } from 'vitest';

import { listingStatusEnum } from '@/db/schema';

import {
  AUTO_WITHDRAWABLE_STATUSES,
  CLOSED_STATUSES,
  ERASABLE_STATUSES,
  MID_SALE_STATUSES,
  deletionPolicyFor,
} from './listing-status';

const partitioned = [
  ...AUTO_WITHDRAWABLE_STATUSES,
  ...MID_SALE_STATUSES,
  ...CLOSED_STATUSES,
];

describe('the listing status partition', () => {
  it('covers every value in the database enum', () => {
    // The point of this test: adding a status to the schema without deciding
    // whether an automated job may transition it should fail here, not ship.
    expect([...partitioned].sort()).toEqual([...listingStatusEnum.enumValues].sort());
  });

  it('puts every status in exactly one group', () => {
    expect(new Set(partitioned).size).toBe(partitioned.length);
  });

  it('never lets a mid-sale status be auto-withdrawn', () => {
    for (const status of MID_SALE_STATUSES) {
      expect(AUTO_WITHDRAWABLE_STATUSES).not.toContain(status);
    }
  });

  it('treats only active listings as auto-withdrawable', () => {
    expect([...AUTO_WITHDRAWABLE_STATUSES]).toEqual(['active']);
  });

  it('treats money-bearing states as mid-sale', () => {
    for (const status of ['pending', 'paid', 'transferred']) {
      expect([...MID_SALE_STATUSES]).toContain(status);
    }
  });

  it('never lets a mid-sale status become erasable', () => {
    for (const status of MID_SALE_STATUSES) {
      expect(ERASABLE_STATUSES).not.toContain(status);
    }
  });
});

describe('deletionPolicyFor', () => {
  it.each(MID_SALE_STATUSES)(
    'leaves a %s listing completely alone, and flags it',
    (status) => {
      expect(deletionPolicyFor(status)).toEqual({
        eraseName: false,
        withdraw: false,
        flagForReview: true,
      });
    }
  );

  it('erases and withdraws an active listing', () => {
    expect(deletionPolicyFor('active')).toEqual({
      eraseName: true,
      withdraw: true,
      flagForReview: false,
    });
  });

  it('erases a withdrawn listing without transitioning it again', () => {
    expect(deletionPolicyFor('withdrawn')).toEqual({
      eraseName: true,
      withdraw: false,
      flagForReview: false,
    });
  });

  it('leaves an unclassified future status alone rather than sweeping it up', () => {
    // If someone adds a status to the enum and forgets to classify it, the
    // partition test above fails — but until they fix it, nothing is erased
    // or withdrawn by accident.
    expect(deletionPolicyFor('some_future_status')).toEqual({
      eraseName: false,
      withdraw: false,
      flagForReview: false,
    });
  });

  it('never withdraws anything it does not also treat as active', () => {
    for (const status of [...MID_SALE_STATUSES, ...CLOSED_STATUSES]) {
      expect(deletionPolicyFor(status).withdraw).toBe(false);
    }
  });
});
