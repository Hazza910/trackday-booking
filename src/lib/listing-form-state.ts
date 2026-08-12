/**
 * The shape passed between the listing form and its Server Action.
 *
 * Kept apart from `listing-input.ts` on purpose: the form is a Client
 * Component and needs the empty state at runtime, so putting these beside the
 * Zod schema would ship Zod to the browser for no reason.
 */

export const NOTES_MAX_LENGTH = 500;

export type ListingFormValues = {
  readonly eventId: string;
  readonly groupLevel: string;
  readonly askingPrice: string;
  readonly originalPrice: string;
  readonly bookingReference: string;
  readonly notes: string;
};

export type ListingFieldName = keyof ListingFormValues;

export type ListingFormState = {
  /** A failure that belongs to the whole form: not signed in, save failed. */
  readonly formError: string | null;
  readonly fieldErrors: Partial<Record<ListingFieldName, readonly string[]>>;
  /** Echoed back so a rejected submit never wipes what the seller typed. */
  readonly values: ListingFormValues;
};

export const EMPTY_LISTING_FORM_VALUES: ListingFormValues = {
  eventId: '',
  groupLevel: '',
  askingPrice: '',
  originalPrice: '',
  bookingReference: '',
  notes: '',
};

export const EMPTY_LISTING_FORM_STATE: ListingFormState = {
  formError: null,
  fieldErrors: {},
  values: EMPTY_LISTING_FORM_VALUES,
};
