import { describe, expect, it } from 'vitest';

import { BUYER_DETAILS_VERSION } from './buyer-details';
import { readStoredBuyerDetails } from './stored-buyer-details';

describe('readStoredBuyerDetails', () => {
  it('reads a row written under the current version', () => {
    expect(
      readStoredBuyerDetails({ fullName: 'Alex Rider', email: 'alex@example.com' })
    ).toEqual({ fullName: 'Alex Rider', email: 'alex@example.com' });
  });

  it('reads a row written before email was collected', () => {
    // `full-name.1` rows exist in production. A reader that assumed the current
    // shape would throw on the only sale that had actually happened.
    expect(readStoredBuyerDetails({ fullName: 'Verification Buyer' })).toEqual({
      fullName: 'Verification Buyer',
    });
  });

  it('names the version it expects, so a bump is a deliberate act', () => {
    expect(BUYER_DETAILS_VERSION).toBe('full-name-email.1');
  });

  it('ignores fields it does not know about', () => {
    // A row written by a later version must stay readable by older code, or a
    // deploy in the wrong order takes out the seller's view of a paid sale.
    expect(
      readStoredBuyerDetails({
        fullName: 'Alex Rider',
        email: 'alex@example.com',
        phone: '07700900123',
      })
    ).toEqual({ fullName: 'Alex Rider', email: 'alex@example.com' });
  });

  it.each([null, undefined, 'a string', 42, [], {}, { email: 'no@name.com' }])(
    'returns null rather than throwing on %j',
    (value) => {
      // The money has already moved by the time anyone reads these. A seller
      // should get "we could not read this" and a support route, not a 500.
      expect(readStoredBuyerDetails(value)).toBeNull();
    }
  );
});
