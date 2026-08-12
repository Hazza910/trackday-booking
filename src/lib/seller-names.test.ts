import { describe, expect, it } from 'vitest';

import { SELLER_FALLBACK_NAME, sellerDisplayName } from './seller-names';

describe('sellerDisplayName', () => {
  describe('a deleted account is anonymous whatever is still stored', () => {
    // The `user.deleted` webhook is forbidden from touching mid-sale rows, so
    // those keep a real name in the database as dispute evidence. It must not
    // reach a reader.
    it('hides a username that is still on the row', () => {
      expect(
        sellerDisplayName({
          username: 'fastharry',
          firstName: 'Harry',
          deletedAt: new Date('2026-08-12T00:00:00Z'),
        })
      ).toBe(SELLER_FALLBACK_NAME);
    });

    it('hides a first name that is still on the row', () => {
      expect(
        sellerDisplayName({
          username: null,
          firstName: 'Harry',
          deletedAt: new Date('2026-08-12T00:00:00Z'),
        })
      ).toBe(SELLER_FALLBACK_NAME);
    });

    it('still shows the name while the account is live', () => {
      expect(
        sellerDisplayName({
          username: 'fastharry',
          firstName: 'Harry',
          deletedAt: null,
        })
      ).toBe('fastharry');
    });

    it('treats an absent deletedAt as live', () => {
      expect(
        sellerDisplayName({ username: 'fastharry', firstName: 'Harry' })
      ).toBe('fastharry');
    });
  });

  it('prefers the username', () => {
    expect(sellerDisplayName({ username: 'fastharry', firstName: 'Harry' })).toBe(
      'fastharry'
    );
  });

  it('falls back to the first name when there is no username', () => {
    expect(sellerDisplayName({ username: null, firstName: 'Harry' })).toBe('Harry');
  });

  it.each(['', '   ', '\t'])(
    'treats a blank username (%j) as absent',
    (username) => {
      expect(sellerDisplayName({ username, firstName: 'Harry' })).toBe('Harry');
    }
  );

  it('trims what it returns', () => {
    expect(sellerDisplayName({ username: '  fastharry  ', firstName: null })).toBe(
      'fastharry'
    );
  });

  it('falls back when both are missing', () => {
    expect(sellerDisplayName({ username: null, firstName: null })).toBe(
      SELLER_FALLBACK_NAME
    );
  });

  it('falls back when both are blank', () => {
    expect(sellerDisplayName({ username: '  ', firstName: '' })).toBe(
      SELLER_FALLBACK_NAME
    );
  });

  describe('never discloses a surname or an email address', () => {
    /**
     * The surname and email have to sit ALONGSIDE a usable name field: if the
     * user has neither a username nor a first name, the function returns a
     * constant and any assertion about it passes whatever the implementation
     * does with `lastName`.
     *
     * Built inside the arrow function so what reaches `sellerDisplayName` is
     * not a fresh literal — excess-property checking would otherwise reject it
     * and the extra fields would never be visible to the implementation at all.
     */
    const withSurnameAndEmail = (
      username: string | null,
      firstName: string | null
    ) => ({
      username,
      firstName,
      lastName: 'Gower',
      fullName: 'Harry Gower',
      primaryEmailAddress: { emailAddress: 'seller@example.com' },
      emailAddresses: [{ emailAddress: 'seller@example.com' }],
    });

    it('returns the username alone', () => {
      expect(sellerDisplayName(withSurnameAndEmail('fastharry', 'Harry'))).toBe(
        'fastharry'
      );
    });

    it('returns the first name alone', () => {
      expect(sellerDisplayName(withSurnameAndEmail(null, 'Harry'))).toBe('Harry');
    });

    it('falls back without reaching for either', () => {
      expect(sellerDisplayName(withSurnameAndEmail(null, null))).toBe(
        SELLER_FALLBACK_NAME
      );
    });
  });
});
