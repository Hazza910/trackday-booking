import { describe, expect, it } from 'vitest';

import { buildMonthGrids, dateAnchorId } from './calendar';

function gridFor(dates: string[]) {
  const counts = new Map(dates.map((iso) => [iso, 1]));
  return buildMonthGrids(counts);
}

/** Every real day in the grid, in order, as ISO strings. */
function isoDays(weeks: readonly (unknown | null)[][]) {
  return weeks
    .flat()
    .filter((cell): cell is { iso: string } => cell !== null && typeof cell === 'object')
    .map((cell) => cell.iso);
}

describe('dateAnchorId', () => {
  it('is derived from the ISO date', () => {
    expect(dateAnchorId('2026-08-12')).toBe('date-2026-08-12');
  });
});

describe('buildMonthGrids', () => {
  it('returns nothing for no dates', () => {
    expect(buildMonthGrids(new Map())).toEqual([]);
  });

  it('builds one grid per month, in date order', () => {
    const grids = gridFor(['2026-10-05', '2026-08-12', '2026-09-01']);
    expect(grids.map((month) => month.key)).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(grids[0].label).toBe('August 2026');
  });

  it('covers exactly the days of the month, in order', () => {
    const [august] = gridFor(['2026-08-12']);
    const days = isoDays(august.weeks);
    expect(days).toHaveLength(31);
    expect(days[0]).toBe('2026-08-01');
    expect(days.at(-1)).toBe('2026-08-31');
  });

  it.each([
    ['2026-08-01', 31],
    ['2026-09-01', 30],
    ['2026-11-01', 30],
    ['2027-02-01', 28],
    ['2028-02-01', 29], // leap year
  ])('gives %s the right number of days (%i)', (iso, expected) => {
    const [month] = gridFor([iso]);
    expect(isoDays(month.weeks)).toHaveLength(expected);
  });

  describe('Monday-first alignment', () => {
    it('has no leading blanks when the month starts on a Monday', () => {
      // 1 June 2026 is a Monday.
      const [june] = gridFor(['2026-06-01']);
      expect(june.weeks[0][0]).not.toBeNull();
      expect(june.weeks[0][0]?.iso).toBe('2026-06-01');
    });

    it('has six leading blanks when the month starts on a Sunday', () => {
      // 1 November 2026 is a Sunday — the last column, Monday-first.
      const [november] = gridFor(['2026-11-01']);
      expect(november.weeks[0].slice(0, 6)).toEqual([
        null,
        null,
        null,
        null,
        null,
        null,
      ]);
      expect(november.weeks[0][6]?.iso).toBe('2026-11-01');
    });

    it('puts a Saturday in the sixth column', () => {
      // 1 August 2026 is a Saturday.
      const [august] = gridFor(['2026-08-01']);
      expect(august.weeks[0][5]?.iso).toBe('2026-08-01');
      expect(august.weeks[0][6]?.iso).toBe('2026-08-02');
    });
  });

  it('pads every week to seven cells', () => {
    for (const month of gridFor(['2026-08-12', '2026-11-03', '2028-02-10'])) {
      for (const week of month.weeks) {
        expect(week).toHaveLength(7);
      }
    }
  });

  it('puts counts on the right days and zero everywhere else', () => {
    const counts = new Map([
      ['2026-08-12', 3],
      ['2026-08-17', 1],
    ]);
    const [august] = buildMonthGrids(counts);
    const byIso = new Map(
      august.weeks
        .flat()
        .filter((cell) => cell !== null)
        .map((cell) => [cell.iso, cell.count])
    );

    expect(byIso.get('2026-08-12')).toBe(3);
    expect(byIso.get('2026-08-17')).toBe(1);
    expect(byIso.get('2026-08-11')).toBe(0);
    expect(byIso.get('2026-08-31')).toBe(0);
  });

  it('does not shift a date across a month boundary', () => {
    // The first and last days are where a timezone bug would show up.
    const [august] = gridFor(['2026-08-01', '2026-08-31']);
    const withCounts = august.weeks
      .flat()
      .filter((cell) => cell !== null && cell.count > 0)
      .map((cell) => cell?.iso);

    expect(withCounts).toEqual(['2026-08-01', '2026-08-31']);
  });
});
