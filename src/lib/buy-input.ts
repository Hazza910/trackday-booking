import { z } from 'zod';

import type { BuyFieldName } from './buy-form-state';
import { FULL_NAME_MAX_LENGTH } from './buyer-details';
import {
  checkForContactDetails,
  describeContactFilterReasons,
} from './contact-filter';

/**
 * Validation for a buyer's claim. Everything submitted passes through here, on
 * the server — `required` on a checkbox is a convenience for the buyer, never a
 * guarantee to us.
 */

/**
 * A consent box. `z.literal('on')` rather than anything looser: an unticked
 * checkbox is absent from the form data entirely and reads back as '', and
 * treating any truthy value as acceptance would let a hand-rolled POST consent
 * on the buyer's behalf.
 */
function acceptance(message: string) {
  return z.literal('on', message);
}

export function buyInputSchema(riskWarningRequired: boolean) {
  return z.object({
    // One transform rather than chained refinements, matching the notes field
    // on the listing form: exactly one message surfaces, and the order
    // (missing, then too long, then contact details) is explicit.
    fullName: z.string('Enter the name on the booking.').transform((raw, ctx) => {
      const value = raw.trim();

      if (value.length < 2) {
        ctx.addIssue({ code: 'custom', message: 'Enter the name on the booking.' });
        return z.NEVER;
      }
      if (value.length > FULL_NAME_MAX_LENGTH) {
        ctx.addIssue({ code: 'custom', message: 'That name is too long.' });
        return z.NEVER;
      }

      // Same rule as the seller's notes, for the same reason: this field is
      // shown to the other party, so it is a channel. Flagged in the PR —
      // the buyer-detail field list is not settled, and whoever settles it
      // should decide whether a name is filtered like free text.
      const contactCheck = checkForContactDetails(value);
      if (!contactCheck.ok) {
        ctx.addIssue({
          code: 'custom',
          message: describeContactFilterReasons(
            contactCheck,
            'That name looks like it contains'
          ),
        });
        return z.NEVER;
      }

      return value;
    }),
    acceptFinalSale: acceptance(
      'You need to accept that the sale is final before you can buy.'
    ),
    // Only demanded when the event is inside 48 hours. When it is not, the box
    // is not rendered at all, so anything that arrives here is ignored rather
    // than rejected — a stale form should not be unsubmittable.
    acceptRisk: riskWarningRequired
      ? acceptance(
          'You need to accept the at-your-own-risk warning before you can buy.'
        )
      : z.string(),
  });
}

export type BuyInput = z.infer<ReturnType<typeof buyInputSchema>>;

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/**
 * Compile-time proof that the schema's fields and the form's field names are
 * the same set, as on the listing form. It can only be `true` when they agree.
 */
export const BUY_FIELDS_MATCH_SCHEMA: Exact<
  keyof z.input<ReturnType<typeof buyInputSchema>>,
  BuyFieldName
> = true;
