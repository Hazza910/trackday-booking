import { describe, expect, it } from 'vitest';

import {
  countByDate,
  eventAnchorId,
  forSaleLabel,
  groupByMonthAndDay,
  withEventAnchors,
} from './listings-view';

describe('eventAnchorId', () => {
  it('is derived from the event id', () => {
    expect(eventAnchorId('abc-123')).toBe('event-abc-123');
  });
});

describe('forSaleLabel', () => {
  it('is singular for one', () => {
    expect(forSaleLabel(1)).toBe('1 for sale');
  });

  it.each([
    [2, '2 for sale'],
    [12, '12 for sale'],
  ])('is plural for %i', (count, expected) => {
    expect(forSaleLabel(count)).toBe(expected);
  });
});

describe('withEventAnchors', () => {
  it('tags only the first row of each event', () => {
    const tagged = withEventAnchors([
      { id: '1', eventId: 'e1' },
      { id: '2', eventId: 'e1' },
      { id: '3', eventId: 'e2' },
    ]);

    expect(tagged.map((row) => row.anchorId)).toEqual([
      'event-e1',
      null,
      'event-e2',
    ]);
  });

  it('stays correct when an event’s rows are not contiguous', () => {
    const tagged = withEventAnchors([
      { id: '1', eventId: 'e1' },
      { id: '2', eventId: 'e2' },
      { id: '3', eventId: 'e1' },
    ]);

    expect(tagged.map((row) => row.anchorId)).toEqual([
      'event-e1',
      'event-e2',
      null,
    ]);
  });

  it('leaves the rest of the row untouched', () => {
    expect(withEventAnchors([{ id: '1', eventId: 'e1', price: 120 }])).toEqual([
      { id: '1', eventId: 'e1', price: 120, anchorId: 'event-e1' },
    ]);
  });

  it('handles an empty list', () => {
    expect(withEventAnchors([])).toEqual([]);
  });
});

describe('groupByMonthAndDay', () => {
  const rows = [
    { id: 'a', eventDate: '2026-08-12' },
    { id: 'b', eventDate: '2026-08-12' },
    { id: 'c', eventDate: '2026-08-17' },
    { id: 'd', eventDate: '2026-09-02' },
  ];

  it('groups into months, then days', () => {
    const months = groupByMonthAndDay(rows);

    expect(months.map((month) => month.key)).toEqual(['2026-08', '2026-09']);
    expect(months[0].days.map((day) => day.iso)).toEqual([
      '2026-08-12',
      '2026-08-17',
    ]);
    expect(months[0].days[0].rows.map((row) => row.id)).toEqual(['a', 'b']);
    expect(months[1].days[0].rows.map((row) => row.id)).toEqual(['d']);
  });

  it('labels months and days for a UK reader', () => {
    const months = groupByMonthAndDay(rows);

    expect(months[0].label).toBe('August 2026');
    expect(months[0].days[0].label).toBe('Wed, 12 August 2026');
  });

  it('preserves the order it is given', () => {
    // The query sorts by date then price; grouping must not resort anything.
    const ordered = groupByMonthAndDay([
      { id: 'cheap', eventDate: '2026-08-12' },
      { id: 'dear', eventDate: '2026-08-12' },
    ]);

    expect(ordered[0].days[0].rows.map((row) => row.id)).toEqual([
      'cheap',
      'dear',
    ]);
  });

  it('keeps every row', () => {
    const months = groupByMonthAndDay(rows);
    const kept = months.flatMap((month) => month.days.flatMap((day) => day.rows));

    expect(kept).toHaveLength(rows.length);
  });

  it('handles an empty list', () => {
    expect(groupByMonthAndDay([])).toEqual([]);
  });
});

describe('countByDate', () => {
  it('counts rows per date', () => {
    const counts = countByDate([
      { eventDate: '2026-08-12' },
      { eventDate: '2026-08-12' },
      { eventDate: '2026-08-17' },
    ]);

    expect(counts.get('2026-08-12')).toBe(2);
    expect(counts.get('2026-08-17')).toBe(1);
    expect(counts.get('2026-08-13')).toBeUndefined();
    expect(counts.size).toBe(2);
  });

  it('handles an empty list', () => {
    expect(countByDate([]).size).toBe(0);
  });
});
