/**
 * The two consent gates a buyer passes before paying.
 *
 * The wording lives here with the version it is stamped under, so
 * `purchases.consent_version` means something checkable: given a version, this
 * file says exactly what the buyer was shown. Change the wording and the
 * version changes with it, in the same commit — a version that silently covers
 * two different texts is worse than no version at all.
 *
 * No Zod and no server imports: the form is a Client Component and renders
 * these strings.
 */

/** Bump whenever either string below changes. */
export const CONSENT_VERSION = '2026-08-16.1';

/** Always shown. */
export const FINAL_SALE_CONSENT =
  'I understand this sale is final. Once I have paid, there is no refund if I change my mind or cannot make the day.';

/**
 * Shown only inside 48 hours of the event — see `isWithinRiskWindow`. The
 * seller has a deadline to complete the name change, and inside this window
 * that deadline has effectively already passed, so there is real chance the
 * transfer does not happen in time.
 */
export const RISK_CONSENT =
  'This track day is less than 48 hours away. I understand the seller may not be able to complete the name change in time, and that I am buying at my own risk.';
