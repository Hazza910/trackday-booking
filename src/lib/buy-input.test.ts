import { describe, expect, it } from 'vitest';

import { buyInputSchema } from './buy-input';
import { EMAIL_MAX_LENGTH, FULL_NAME_MAX_LENGTH } from './buyer-details';
import { checkForContactDetails } from './contact-filter';
import {
  CONSENT_VERSION,
  FINAL_SALE_CONSENT,
  RISK_CONSENT,
} from './consent';

const valid = {
  fullName: 'Alex Rider',
  email: 'alex@example.com',
  acceptFinalSale: 'on',
  acceptRisk: 'on',
};

function parse(values: Record<string, string>, riskWarningRequired = false) {
  return buyInputSchema(riskWarningRequired).safeParse(values);
}

function errorsFor(
  values: Record<string, string>,
  riskWarningRequired = false
): Record<string, string[] | undefined> {
  const result = parse(values, riskWarningRequired);
  if (result.success) {
    return {};
  }
  const flattened: Record<string, string[] | undefined> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0]);
    flattened[key] = [...(flattened[key] ?? []), issue.message];
  }
  return flattened;
}

describe('the name on the booking', () => {
  it('accepts an ordinary name', () => {
    const result = parse(valid);
    expect(result.success && result.data.fullName).toBe('Alex Rider');
  });

  it('trims surrounding whitespace', () => {
    const result = parse({ ...valid, fullName: '  Alex Rider  ' });
    expect(result.success && result.data.fullName).toBe('Alex Rider');
  });

  it('rejects an empty name', () => {
    expect(errorsFor({ ...valid, fullName: '' }).fullName).toEqual([
      'Enter the name on the booking.',
    ]);
  });

  it('rejects a name of only whitespace', () => {
    expect(errorsFor({ ...valid, fullName: '   ' }).fullName).toEqual([
      'Enter the name on the booking.',
    ]);
  });

  it('rejects a name past the length limit', () => {
    const tooLong = 'a'.repeat(FULL_NAME_MAX_LENGTH + 1);
    expect(errorsFor({ ...valid, fullName: tooLong }).fullName).toEqual([
      'That name is too long.',
    ]);
  });

  it('accepts a name exactly at the limit', () => {
    const atLimit = 'a'.repeat(FULL_NAME_MAX_LENGTH);
    expect(parse({ ...valid, fullName: atLimit }).success).toBe(true);
  });

  it('rejects contact details smuggled into the name', () => {
    // The field is shown to the seller, so it is a channel — same rule as the
    // seller's notes, for the same reason.
    const result = parse({ ...valid, fullName: 'Alex 07700 900123' });
    expect(result.success).toBe(false);
  });

  it.each([
    "Siobhan O'Brien",
    'Smith-Jones',
    'Anne-Marie Dubois',
    'Jean-Luc de la Croix',
    "Patrick O'Sullivan",
    'Mary-Kate Olsen',
    'Ng Wei Ming',
    'Bjorn Andersen',
    'Clive Livingstone',
    'Dominic Freeman',
  ])('lets the real name %j through the filter', (fullName) => {
    // The filter is friction aimed at people routing around the platform, and
    // it must not become friction aimed at people with apostrophes and hyphens
    // in their names. Rejecting a buyer's own name at a payment step is a
    // failure they cannot fix.
    const result = parse({ ...valid, fullName });
    expect(result.success && result.data.fullName).toBe(fullName);
  });

  it('tells the buyer about their name, not about their notes', () => {
    // The filter is shared with the seller's notes field, whose message would
    // otherwise tell a buyer to fix "your notes" when they typed a name.
    const errors = errorsFor({ ...valid, fullName: 'Alex 07700 900123' });
    expect(errors.fullName?.[0]).toMatch(/^That name looks like it contains/);
  });
});

describe('the buyer email', () => {
  it('accepts an ordinary address', () => {
    const result = parse(valid);
    expect(result.success && result.data.email).toBe('alex@example.com');
  });

  it('trims surrounding whitespace', () => {
    const result = parse({ ...valid, email: '  alex@example.com  ' });
    expect(result.success && result.data.email).toBe('alex@example.com');
  });

  it('is required', () => {
    expect(errorsFor({ ...valid, email: '' }).email).toBeDefined();
  });

  it.each(['not-an-email', 'alex@', '@example.com', 'alex example.com'])(
    'rejects %j',
    (email) => {
      expect(parse({ ...valid, email }).success).toBe(false);
    }
  );

  it('rejects an address past the RFC length limit', () => {
    const tooLong = `${'a'.repeat(EMAIL_MAX_LENGTH)}@example.com`;
    expect(errorsFor({ ...valid, email: tooLong }).email).toEqual([
      'That email address is too long.',
    ]);
  });

  it('is exempt from the contact filter', () => {
    // The booking-reference precedent: a field whose whole purpose is to carry
    // a contact detail, and whose format is validated, must not be run through
    // a filter built to catch contact details hidden in free text. Filtering it
    // would reject every valid value — including this one.
    expect(checkForContactDetails('alex@example.com').ok).toBe(false);
    expect(parse({ ...valid, email: 'alex@example.com' }).success).toBe(true);
  });

  it('accepts an address that differs from the account signed in with', () => {
    // Prefilled from Clerk, but the provider account may use another address.
    expect(
      parse({ ...valid, email: 'different@provider-account.co.uk' }).success
    ).toBe(true);
  });
});

describe('the final-sale gate', () => {
  it('accepts a ticked box', () => {
    expect(parse(valid).success).toBe(true);
  });

  it('rejects an unticked box, which arrives as an empty string', () => {
    expect(errorsFor({ ...valid, acceptFinalSale: '' }).acceptFinalSale).toEqual([
      'You need to accept that the sale is final before you can buy.',
    ]);
  });

  it.each(['true', '1', 'yes', 'ON'])(
    'rejects %j rather than treating anything truthy as consent',
    (value) => {
      // A hand-rolled POST should not be able to consent on the buyer's behalf
      // with a value the real checkbox could never send.
      expect(parse({ ...valid, acceptFinalSale: value }).success).toBe(false);
    }
  );
});

describe('the at-your-own-risk gate', () => {
  it('is demanded when the event is inside 48 hours', () => {
    expect(
      errorsFor({ ...valid, acceptRisk: '' }, true).acceptRisk
    ).toEqual([
      'You need to accept the at-your-own-risk warning before you can buy.',
    ]);
  });

  it('passes when it is demanded and given', () => {
    expect(parse(valid, true).success).toBe(true);
  });

  it('is not demanded when the event is further out', () => {
    expect(parse({ ...valid, acceptRisk: '' }, false).success).toBe(true);
  });

  it('ignores a stale value when it is not demanded', () => {
    // The box is not rendered at all outside the window; a form that still
    // carries the field should not become unsubmittable because of it.
    expect(parse({ ...valid, acceptRisk: 'on' }, false).success).toBe(true);
  });

  it('still demands the final-sale gate inside the window', () => {
    const errors = errorsFor(
      { ...valid, acceptFinalSale: '', acceptRisk: 'on' },
      true
    );
    expect(errors.acceptFinalSale).toBeDefined();
  });

  it('reports both gates at once when neither is ticked', () => {
    const errors = errorsFor(
      { fullName: 'Alex Rider', acceptFinalSale: '', acceptRisk: '' },
      true
    );
    expect(errors.acceptFinalSale).toBeDefined();
    expect(errors.acceptRisk).toBeDefined();
  });
});

describe('the consent version', () => {
  it('matches the wording it is stamped against', () => {
    // A version that silently covers two different texts is worse than no
    // version at all. If you change either string, bump CONSENT_VERSION and
    // update this test in the same commit — that is what this test is for.
    expect(CONSENT_VERSION).toBe('2026-08-16.1');
    expect(FINAL_SALE_CONSENT).toBe(
      'I understand this sale is final. Once I have paid, there is no refund if I change my mind or cannot make the day.'
    );
    expect(RISK_CONSENT).toBe(
      'This track day is less than 48 hours away. I understand the seller may not be able to complete the name change in time, and that I am buying at my own risk.'
    );
  });
});
