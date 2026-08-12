import { monthFormatter, parseEventDate } from './events';

/**
 * Month grids for the listings calendar.
 *
 * Every calculation is in UTC, matching how `event_date` is stored and read
 * (a Postgres `date`, handled as a `YYYY-MM-DD` string), so a day never
 * shifts because the server happens to be somewhere else.
 */

/** A cell in the grid. `null` pads the days belonging to a neighbouring month. */
export type CalendarDay = {
  readonly iso: string;
  readonly dayOfMonth: number;
  readonly count: number;
};

export type CalendarMonth = {
  /** `YYYY-MM`, useful as a React key. */
  readonly key: string;
  readonly label: string;
  readonly weeks: readonly (CalendarDay | null)[][];
};

/** Weekday headings, Monday-first, as the UK reads a calendar. */
export const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

const DAYS_PER_WEEK = 7;

export function dateAnchorId(isoDate: string) {
  return `date-${isoDate}`;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

/**
 * Monday-first column index. `getUTCDay()` is Sunday-first (0 = Sunday), so
 * Sunday has to move from the front of the week to the back.
 */
function mondayFirstIndex(date: Date) {
  return (date.getUTCDay() + 6) % DAYS_PER_WEEK;
}

/**
 * Builds one grid per month that has any listings, in date order.
 *
 * Takes the counts rather than the rows so the caller decides what is being
 * counted, and so this stays testable without a listing shape.
 */
export function buildMonthGrids(
  countsByDate: ReadonlyMap<string, number>
): CalendarMonth[] {
  const monthKeys = [...new Set([...countsByDate.keys()].map((iso) => iso.slice(0, 7)))].sort();

  return monthKeys.map((key) => {
    const [year, month] = key.split('-').map(Number);

    // Day 0 of the next month is the last day of this one.
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const leadingBlanks = mondayFirstIndex(new Date(Date.UTC(year, month - 1, 1)));

    const cells: (CalendarDay | null)[] = Array.from(
      { length: leadingBlanks },
      () => null
    );

    for (let dayOfMonth = 1; dayOfMonth <= daysInMonth; dayOfMonth += 1) {
      const iso = `${key}-${pad(dayOfMonth)}`;
      cells.push({ iso, dayOfMonth, count: countsByDate.get(iso) ?? 0 });
    }

    while (cells.length % DAYS_PER_WEEK !== 0) {
      cells.push(null);
    }

    const weeks: (CalendarDay | null)[][] = [];
    for (let index = 0; index < cells.length; index += DAYS_PER_WEEK) {
      weeks.push(cells.slice(index, index + DAYS_PER_WEEK));
    }

    return {
      key,
      label: monthFormatter.format(parseEventDate(`${key}-01`)),
      weeks,
    };
  });
}
