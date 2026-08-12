import { describe, expect, it } from 'vitest';

import {
  CLERK_USER_ID_BATCH,
  SELLER_FALLBACK_NAME,
  chunkUserIds,
  sellerDisplayName,
} from './seller-names';

describe('sellerDisplayName', () => {
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

describe('chunkUserIds', () => {
  it('returns nothing for no ids', () => {
    expect(chunkUserIds([])).toEqual([]);
  });

  it('keeps a small set in one batch', () => {
    expect(chunkUserIds(['user_a', 'user_b'])).toEqual([['user_a', 'user_b']]);
  });

  it('de-duplicates while preserving first-seen order', () => {
    expect(chunkUserIds(['user_b', 'user_a', 'user_b', 'user_a'])).toEqual([
      ['user_b', 'user_a'],
    ]);
  });

  it('splits at Clerk’s 100-id cap', () => {
    const ids = Array.from({ length: 250 }, (_, index) => `user_${index}`);
    const chunks = chunkUserIds(ids);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(CLERK_USER_ID_BATCH);
    expect(chunks[1]).toHaveLength(CLERK_USER_ID_BATCH);
    expect(chunks[2]).toHaveLength(50);
    expect(chunks.flat()).toHaveLength(250);
  });

  it('counts distinct ids, not listings', () => {
    // 300 listings, all from the same seller, is still one request.
    const ids = Array.from({ length: 300 }, () => 'user_same');
    expect(chunkUserIds(ids)).toEqual([['user_same']]);
  });

  it('honours a smaller batch size', () => {
    expect(chunkUserIds(['a', 'b', 'c'], 2)).toEqual([['a', 'b'], ['c']]);
  });
});
