import { describe, expect, it } from 'vitest';

import {
  BLANK_SELLER_COLUMNS,
  sellerColumnsFromPayload,
  userDeletedPayloadSchema,
  userUpdatedPayloadSchema,
} from './clerk-webhook';
import { sellerDisplayName } from './seller-names';

describe('userUpdatedPayloadSchema', () => {
  it('accepts a full payload', () => {
    const result = userUpdatedPayloadSchema.safeParse({
      id: 'user_1',
      username: 'fastharry',
      first_name: 'Harry',
      last_name: 'Gower',
      primary_email_address_id: 'idn_1',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        id: 'user_1',
        username: 'fastharry',
        first_name: 'Harry',
      });
    }
  });

  it('keeps only the fields we store — never the surname or email', () => {
    const result = userUpdatedPayloadSchema.parse({
      id: 'user_1',
      username: 'fastharry',
      first_name: 'Harry',
      last_name: 'Gower',
      email_addresses: [{ email_address: 'seller@example.com' }],
    });

    expect(Object.keys(result).sort()).toEqual(['first_name', 'id', 'username']);
    expect(JSON.stringify(result)).not.toContain('Gower');
    expect(JSON.stringify(result)).not.toContain('example.com');
  });

  it.each([
    [null, null],
    [undefined, null],
    ['', null],
    ['   ', null],
    ['  fastharry  ', 'fastharry'],
  ])('normalises username %j to %j', (username, expected) => {
    const result = userUpdatedPayloadSchema.parse({
      id: 'user_1',
      username,
      first_name: null,
    });

    expect(result.username).toBe(expected);
  });

  it('accepts a payload with the name fields absent entirely', () => {
    const result = userUpdatedPayloadSchema.safeParse({ id: 'user_1' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.username).toBeNull();
      expect(result.data.first_name).toBeNull();
    }
  });

  it.each([{}, { id: '' }, { id: 123 }, { id: null }])(
    'rejects %j for want of a usable id',
    (payload) => {
      expect(userUpdatedPayloadSchema.safeParse(payload).success).toBe(false);
    }
  );

  it('does not accept the SDK camelCase shape by mistake', () => {
    // `firstName` is the SDK's User class; the wire format is `first_name`.
    // Accepting it silently would store null for everyone.
    const result = userUpdatedPayloadSchema.parse({
      id: 'user_1',
      username: null,
      firstName: 'Harry',
    });

    expect(result.first_name).toBeNull();
  });
});

describe('userDeletedPayloadSchema', () => {
  it('accepts a deletion carrying an id', () => {
    expect(
      userDeletedPayloadSchema.safeParse({ id: 'user_1', deleted: true }).success
    ).toBe(true);
  });

  it.each([{ deleted: true }, { id: undefined }, { id: '' }])(
    'rejects %j — an absent id must never become a query predicate',
    (payload) => {
      expect(userDeletedPayloadSchema.safeParse(payload).success).toBe(false);
    }
  );
});

describe('sellerColumnsFromPayload', () => {
  it('maps the wire fields onto the columns', () => {
    expect(
      sellerColumnsFromPayload({ username: 'fastharry', first_name: 'Harry' })
    ).toEqual({ sellerUsername: 'fastharry', sellerFirstName: 'Harry' });
  });

  it('round-trips through the display rule', () => {
    const columns = sellerColumnsFromPayload({
      username: null,
      first_name: 'Harry',
    });

    expect(
      sellerDisplayName({
        username: columns.sellerUsername,
        firstName: columns.sellerFirstName,
      })
    ).toBe('Harry');
  });
});

describe('BLANK_SELLER_COLUMNS', () => {
  it('leaves nothing behind', () => {
    expect(BLANK_SELLER_COLUMNS).toEqual({
      sellerUsername: null,
      sellerFirstName: null,
    });
  });

  it('renders as the anonymous fallback', () => {
    expect(
      sellerDisplayName({
        username: BLANK_SELLER_COLUMNS.sellerUsername,
        firstName: BLANK_SELLER_COLUMNS.sellerFirstName,
      })
    ).toBe('A seller');
  });
});
