/**
 * Which listing states an automated job may change, and which it may not.
 *
 * The distinction exists because a listing past `active` has money or an
 * obligation attached to it. When a seller deletes their Clerk account, their
 * unsold listings can be withdrawn automatically — but a listing that is
 * pending, paid or transferred is a dispute for a human to resolve, and an
 * automated status change would destroy the record of what state the sale was
 * actually in.
 *
 * Kept as an exhaustive partition rather than a single constant so that adding
 * a status to the enum forces a decision here: `listing-status.test.ts` fails
 * if a new value belongs to neither list.
 */

/** Safe for an automated job to withdraw. */
export const AUTO_WITHDRAWABLE_STATUSES = ['active'] as const;

/** Must never be transitioned automatically — flag for review instead. */
export const MID_SALE_STATUSES = ['pending', 'paid', 'transferred'] as const;

/** Already terminal; nothing to do. */
export const CLOSED_STATUSES = ['withdrawn'] as const;

export type AutoWithdrawableStatus = (typeof AUTO_WITHDRAWABLE_STATUSES)[number];
export type MidSaleStatus = (typeof MID_SALE_STATUSES)[number];

/**
 * The statuses whose seller name an automated job may erase.
 *
 * Derived from the partition rather than written out again, so the route's
 * queries cannot drift from the rule the tests enforce. Built by inclusion,
 * not by excluding the mid-sale list: a status added to the enum and not yet
 * classified is then left alone by default instead of being swept up.
 */
export const ERASABLE_STATUSES = [
  ...AUTO_WITHDRAWABLE_STATUSES,
  ...CLOSED_STATUSES,
] as const;

/**
 * What the `user.deleted` webhook should do to one listing, given its status.
 * Pure, so the policy is testable without a database or a signed request.
 */
export function deletionPolicyFor(status: string): {
  readonly eraseName: boolean;
  readonly withdraw: boolean;
  readonly flagForReview: boolean;
} {
  const midSale = MID_SALE_STATUSES.some((value) => value === status);
  if (midSale) {
    // Money or an obligation is attached: leave every column exactly as it is
    // and surface it for a human instead.
    return { eraseName: false, withdraw: false, flagForReview: true };
  }

  return {
    eraseName: ERASABLE_STATUSES.some((value) => value === status),
    withdraw: AUTO_WITHDRAWABLE_STATUSES.some((value) => value === status),
    flagForReview: false,
  };
}
