/**
 * The shape passed between the buy form and its Server Action.
 *
 * Kept apart from `buy-input.ts` for the same reason the listing form is: this
 * is imported by a Client Component, and sitting beside the Zod schema would
 * ship Zod to the browser for nothing.
 */

export type BuyFormValues = {
  readonly fullName: string;
  /** Checkboxes arrive as 'on' when ticked and are absent when not. */
  readonly acceptFinalSale: string;
  readonly acceptRisk: string;
};

export type BuyFieldName = keyof BuyFormValues;

export type BuyFormState = {
  /** A failure belonging to the whole form: not signed in, listing gone. */
  readonly formError: string | null;
  /**
   * Set when another buyer took the listing between this one opening the form
   * and submitting it. Distinct from a plain `formError` because it is not the
   * buyer's mistake and there is something useful to offer them — the hold may
   * still lapse, and there are other listings.
   */
  readonly raceLost: boolean;
  readonly fieldErrors: Partial<Record<BuyFieldName, readonly string[]>>;
  /** Echoed back so losing the race never wipes what the buyer typed. */
  readonly values: BuyFormValues;
};

export const EMPTY_BUY_FORM_VALUES: BuyFormValues = {
  fullName: '',
  acceptFinalSale: '',
  acceptRisk: '',
};

export const EMPTY_BUY_FORM_STATE: BuyFormState = {
  formError: null,
  raceLost: false,
  fieldErrors: {},
  values: EMPTY_BUY_FORM_VALUES,
};
