import { describe, expect, it } from 'vitest';

import { groupLevelEnum } from '@/db/schema';

import { GROUP_LEVELS } from './group-levels';
import { listingInputSchema } from './listing-input';

const VALID = {
  eventId: '3f6d6c9e-1f2a-4b8c-9d1e-2a3b4c5d6e7f',
  groupLevel: 'intermediate',
  askingPrice: '120',
  originalPrice: '150',
  bookingReference: 'MSV-88213',
  notes: '',
};

function parse(overrides: Partial<typeof VALID> = {}) {
  return listingInputSchema.safeParse({ ...VALID, ...overrides });
}

/** First error message for a field, or undefined if that field passed. */
function errorFor(
  result: ReturnType<typeof parse>,
  field: keyof typeof VALID
): string | undefined {
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path[0] === field)?.message;
}

describe('the group level tuple', () => {
  it('matches the database enum exactly', () => {
    expect([...groupLevelEnum.enumValues]).toEqual([...GROUP_LEVELS]);
  });
});

describe('listingInputSchema', () => {
  it('accepts a well-formed listing', () => {
    const result = parse();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.askingPrice).toBe(12_000);
      expect(result.data.originalPrice).toBe(15_000);
      expect(result.data.notes).toBeNull();
    }
  });

  describe('prices', () => {
    it.each([
      ['120', 12_000],
      ['120.50', 12_050],
      ['10', 1_000],
      ['1000', 100_000],
      ['£1,000', 100_000],
    ])('converts %j to %i pence', (askingPrice, pence) => {
      const result = parse({ askingPrice });
      expect(result.success && result.data.askingPrice).toBe(pence);
    });

    it.each(['12.999', '-5', 'abc', '120.', '.50'])(
      'rejects %j as malformed',
      (askingPrice) => {
        expect(errorFor(parse({ askingPrice }), 'askingPrice')).toBe(
          'Enter the asking price in pounds, like 120 or 120.50.'
        );
      }
    );

    it('rejects an empty price with its own message', () => {
      expect(errorFor(parse({ askingPrice: '' }), 'askingPrice')).toBe(
        'Enter the asking price in pounds.'
      );
    });

    it.each(['9.99', '0', '0.01'])('rejects %j as below the floor', (askingPrice) => {
      expect(errorFor(parse({ askingPrice }), 'askingPrice')).toBe(
        'The asking price must be at least £10.'
      );
    });

    it.each(['1000.01', '1001', '9999'])(
      'rejects %j as above the ceiling',
      (askingPrice) => {
        expect(errorFor(parse({ askingPrice }), 'askingPrice')).toBe(
          'The asking price must be no more than £1,000.'
        );
      }
    );

    it('applies the same rules to the original price', () => {
      expect(errorFor(parse({ originalPrice: '12.999' }), 'originalPrice')).toBe(
        'Enter the price you paid in pounds, like 120 or 120.50.'
      );
      expect(errorFor(parse({ originalPrice: '9.99' }), 'originalPrice')).toBe(
        'The price you paid must be at least £10.'
      );
    });

    it('never mentions pence to the seller', () => {
      const result = parse({ askingPrice: '9.99', originalPrice: '1000.01' });
      expect(result.success).toBe(false);
      if (!result.success) {
        for (const issue of result.error.issues) {
          expect(issue.message.toLowerCase()).not.toContain('pence');
        }
      }
    });
  });

  describe('event and group', () => {
    it.each(['', 'not-a-uuid', '12345'])('rejects %j as an event id', (eventId) => {
      expect(errorFor(parse({ eventId }), 'eventId')).toBe(
        'Choose an event from the list.'
      );
    });

    it.each(GROUP_LEVELS)('accepts the %s group', (groupLevel) => {
      expect(parse({ groupLevel }).success).toBe(true);
    });

    it.each(['', 'expert', 'Novice'])('rejects %j as a group', (groupLevel) => {
      expect(errorFor(parse({ groupLevel }), 'groupLevel')).toBe(
        'Choose the group your place is booked into.'
      );
    });
  });

  describe('booking reference', () => {
    it('is trimmed', () => {
      const result = parse({ bookingReference: '  MSV-88213  ' });
      expect(result.success && result.data.bookingReference).toBe('MSV-88213');
    });

    it.each(['', '  ', 'ab'])('rejects %j as too short', (bookingReference) => {
      expect(errorFor(parse({ bookingReference }), 'bookingReference')).toBe(
        'Enter the booking reference from your provider.'
      );
    });

    it('rejects one longer than 64 characters', () => {
      expect(errorFor(parse({ bookingReference: 'x'.repeat(65) }), 'bookingReference')).toBe(
        'That booking reference is too long.'
      );
    });

    it('accepts an 8-digit reference the contact filter would reject in notes', () => {
      const result = parse({ bookingReference: '12345678' });
      expect(result.success && result.data.bookingReference).toBe('12345678');
    });
  });

  describe('notes', () => {
    it('becomes null when blank', () => {
      const result = parse({ notes: '   ' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.notes).toBeNull();
      }
    });

    it('is trimmed and kept when present', () => {
      const result = parse({ notes: '  Novice group, 2019 R6.  ' });
      expect(result.success && result.data.notes).toBe('Novice group, 2019 R6.');
    });

    it('rejects more than 500 characters', () => {
      expect(errorFor(parse({ notes: 'x'.repeat(501) }), 'notes')).toBe(
        'Notes must be 500 characters or fewer.'
      );
    });

    it('accepts exactly 500 characters', () => {
      expect(parse({ notes: 'x'.repeat(500) }).success).toBe(true);
    });

    it('rejects contact details and says what it found', () => {
      const message = errorFor(
        parse({ notes: 'WhatsApp me on 07700 900123' }),
        'notes'
      );
      expect(message).toContain('a phone number');
      expect(message).toContain('a way to make contact off-site');
    });
  });
});
