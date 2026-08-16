import { describe, expect, it } from 'vitest';

import {
  RISK_WINDOW_MS,
  TRANSFER_WINDOW_MS,
  eventStartsAt,
  isWithinRiskWindow,
  transferDeadlineAt,
} from './event-timing';

describe('eventStartsAt', () => {
  it('resolves midnight London in winter, when London is UTC', () => {
    expect(eventStartsAt('2026-01-15').toISOString()).toBe(
      '2026-01-15T00:00:00.000Z'
    );
  });

  it('resolves midnight London in summer, when London is an hour ahead', () => {
    // 00:00 BST is 23:00 UTC the previous day. Getting this wrong would shift
    // every summer deadline by an hour, in the direction that gives the seller
    // longer than they were promised.
    expect(eventStartsAt('2026-07-04').toISOString()).toBe(
      '2026-07-03T23:00:00.000Z'
    );
  });

  it('handles the day the clocks go forward', () => {
    // 29 March 2026: the change happens at 01:00, so midnight is still GMT.
    expect(eventStartsAt('2026-03-29').toISOString()).toBe(
      '2026-03-29T00:00:00.000Z'
    );
  });

  it('handles the day the clocks go back', () => {
    // 25 October 2026: the change happens at 02:00 BST, so midnight is still
    // BST — 23:00 UTC on the 24th.
    expect(eventStartsAt('2026-10-25').toISOString()).toBe(
      '2026-10-24T23:00:00.000Z'
    );
  });

  it('lands on the right calendar day in London, whatever the offset', () => {
    const londonDay = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    for (const date of [
      '2026-01-01',
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
      '2026-06-21',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-12-31',
    ]) {
      expect(londonDay.format(eventStartsAt(date))).toBe(date);
    }
  });
});

describe('isWithinRiskWindow', () => {
  it('is 48 hours', () => {
    expect(RISK_WINDOW_MS).toBe(172_800_000);
  });

  it('is false comfortably before the event', () => {
    expect(isWithinRiskWindow('2026-01-15', new Date('2026-01-01T00:00:00Z'))).toBe(
      false
    );
  });

  it('is true inside the window', () => {
    expect(isWithinRiskWindow('2026-01-15', new Date('2026-01-14T00:00:00Z'))).toBe(
      true
    );
  });

  it('turns true exactly 48 hours out', () => {
    expect(isWithinRiskWindow('2026-01-15', new Date('2026-01-13T00:00:00Z'))).toBe(
      true
    );
  });

  it('is still false a moment before that', () => {
    expect(
      isWithinRiskWindow('2026-01-15', new Date('2026-01-12T23:59:59Z'))
    ).toBe(false);
  });

  it('stays true once the event has started', () => {
    expect(isWithinRiskWindow('2026-01-15', new Date('2026-01-16T00:00:00Z'))).toBe(
      true
    );
  });

  it('accounts for BST when deciding the window', () => {
    // Event starts 2026-07-03T23:00Z, so 48 hours out is 2026-07-01T23:00Z.
    expect(
      isWithinRiskWindow('2026-07-04', new Date('2026-07-01T22:59:59Z'))
    ).toBe(false);
    expect(
      isWithinRiskWindow('2026-07-04', new Date('2026-07-01T23:00:00Z'))
    ).toBe(true);
  });
});

describe('transferDeadlineAt', () => {
  it('is 72 hours', () => {
    expect(TRANSFER_WINDOW_MS).toBe(259_200_000);
  });

  it('gives the seller 72 hours when the event is far off', () => {
    expect(
      transferDeadlineAt(new Date('2026-01-01T09:00:00Z'), '2026-06-01')
    ).toEqual(new Date('2026-01-04T09:00:00Z'));
  });

  it('cuts the 72 hours short to stay 48 hours clear of the event', () => {
    // Paid two days before a 15 January event: 72 hours would run past the
    // event itself, so the 48-hours-before rule wins.
    expect(
      transferDeadlineAt(new Date('2026-01-11T09:00:00Z'), '2026-01-15')
    ).toEqual(new Date('2026-01-13T00:00:00Z'));
  });

  it('takes whichever comes first, right at the crossover', () => {
    // 72 hours and 48-hours-before land on the same instant here.
    expect(
      transferDeadlineAt(new Date('2026-01-10T00:00:00Z'), '2026-01-15')
    ).toEqual(new Date('2026-01-13T00:00:00Z'));
  });

  it('never sets a deadline before the payment that created it', () => {
    // Bought inside the 48-hour window, so "48 hours before the event" is
    // already in the past. The deadline is the moment of payment: immediately.
    const paidAt = new Date('2026-01-14T12:00:00Z');
    expect(transferDeadlineAt(paidAt, '2026-01-15')).toEqual(paidAt);
  });

  it('never sets a deadline before payment even for an event already under way', () => {
    const paidAt = new Date('2026-01-16T12:00:00Z');
    expect(transferDeadlineAt(paidAt, '2026-01-15')).toEqual(paidAt);
  });

  it('is always in the window it promises', () => {
    const paidAt = new Date('2026-05-01T08:30:00Z');
    for (const eventDate of ['2026-05-02', '2026-05-04', '2026-05-10']) {
      const deadline = transferDeadlineAt(paidAt, eventDate);
      expect(deadline.getTime()).toBeGreaterThanOrEqual(paidAt.getTime());
      expect(deadline.getTime()).toBeLessThanOrEqual(
        paidAt.getTime() + TRANSFER_WINDOW_MS
      );
    }
  });
});
