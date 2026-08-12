import { describe, expect, it } from 'vitest';

import {
  checkForContactDetails,
  describeContactFilterReasons,
} from './contact-filter';

function reasonsFor(text: string) {
  const result = checkForContactDetails(text);
  return result.ok ? [] : [...result.reasons];
}

describe('checkForContactDetails', () => {
  describe('rejects', () => {
    it.each([
      ['call me on 07700 900123', 'phone-number'],
      ['ring 07700900123', 'phone-number'],
      ['tel 0770-090-0123', 'phone-number'],
      ['+44 7700 900123', 'phone-number'],
      ['email bob@example.com', 'email'],
      ['find me @bobsmith over there', 'at-symbol'],
      ['see https://example.com/x', 'url'],
      ['www.trackdays.co.uk', 'url'],
      ['also listed on bikesforsale.com', 'url'],
      ['sort code 12-34-56', 'sort-code'],
      ['account 12345678', 'account-number'],
      ['acct 1234 5678', 'account-number'],
      ['WhatsApp me', 'contact-keyword'],
      ['msg me on Insta', 'contact-keyword'],
      ['instagram is easier', 'contact-keyword'],
      ['DM me', 'contact-keyword'],
      ['FB messenger works', 'contact-keyword'],
      ['facebook is fine', 'contact-keyword'],
      ['snapchat or telegram', 'contact-keyword'],
      ['paypal friends and family', 'contact-keyword'],
      ['happy to take a bank transfer', 'contact-keyword'],
    ])('%j as %s', (text, reason) => {
      expect(reasonsFor(text)).toContain(reason);
    });

    it('reports a phone number without also calling it an account number', () => {
      expect(reasonsFor('call 07700900123')).toEqual(['phone-number']);
    });

    it('reports a sort code without also calling it an account number', () => {
      expect(reasonsFor('sort code 12-34-56')).toEqual(['sort-code']);
    });

    it('reports an email without also reporting a bare @ or a url', () => {
      expect(reasonsFor('mail bob@example.com')).toEqual(['email']);
    });

    it('reports every distinct violation at once', () => {
      expect(reasonsFor('call 07700900123 or dm me')).toEqual([
        'phone-number',
        'contact-keyword',
      ]);
    });

    it('rejects an ISO date, the accepted cost of stripping separators', () => {
      expect(reasonsFor('booked on 2026-08-12')).toEqual(['account-number']);
    });

    it('is case-insensitive on keywords', () => {
      for (const text of ['WHATSAPP', 'WhatsApp', 'whatsapp']) {
        expect(reasonsFor(text)).toEqual(['contact-keyword']);
      }
    });
  });

  describe('accepts', () => {
    it.each([
      '',
      'Novice group, booked in March. Bike is a 2019 R6.',
      'Selling because of a date clash.',
      'Sold because of an instant work trip.',
      'Admin fee is already paid.',
      'Ran 1:58 laps at Donington. Great day.',
      'Price is firm at £250, no offers.',
      'Transfer is free through the MSV name change process.',
      '12 sets of tyres and 3 spare visors.',
      'Rescheduled from 20 June 2026.',
    ])('%j', (text) => {
      expect(checkForContactDetails(text)).toEqual({ ok: true });
    });
  });
});

describe('describeContactFilterReasons', () => {
  it('is empty for clean text', () => {
    expect(describeContactFilterReasons({ ok: true })).toBe('');
  });

  it('names a single reason', () => {
    expect(describeContactFilterReasons(checkForContactDetails('07700900123'))).toContain(
      'a phone number'
    );
  });

  it('lists several reasons readably', () => {
    const message = describeContactFilterReasons(
      checkForContactDetails('call 07700900123 or dm me')
    );
    expect(message).toContain('a phone number and a way to make contact off-site');
  });
});
