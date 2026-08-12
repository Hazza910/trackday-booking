import { dateFormatter, monthFormatter, parseEventDate } from './events';

/** Presentation helpers for the buyer-facing listings view. */

/** Where the homepage's "for sale" badge lands. */
export function eventAnchorId(eventId: string) {
  return `event-${eventId}`;
}

export function forSaleLabel(count: number) {
  return count === 1 ? '1 for sale' : `${count} for sale`;
}

/**
 * Tags the first listing of each event with its anchor, so
 * `/listings#event-<id>` lands on that event's cheapest listing.
 *
 * Uses a seen-set rather than comparing neighbours, so the result stays
 * correct even if rows for one event are not contiguous.
 */
export function withEventAnchors<T extends { eventId: string }>(
  rows: readonly T[]
): Array<T & { anchorId: string | null }> {
  const seen = new Set<string>();

  return rows.map((row) => {
    if (seen.has(row.eventId)) {
      return { ...row, anchorId: null };
    }
    seen.add(row.eventId);
    return { ...row, anchorId: eventAnchorId(row.eventId) };
  });
}

export type ListingDay<T> = {
  readonly iso: string;
  readonly label: string;
  readonly rows: T[];
};

export type ListingMonth<T> = {
  readonly key: string;
  readonly label: string;
  readonly days: ListingDay<T>[];
};

/**
 * Groups rows into months, then days, preserving the order they arrive in —
 * the caller owns the sort, this only inserts the breaks. Rows for one date
 * are expected to be contiguous, which the query's ordering guarantees.
 */
export function groupByMonthAndDay<T extends { eventDate: string }>(
  rows: readonly T[]
): ListingMonth<T>[] {
  const months: ListingMonth<T>[] = [];

  for (const row of rows) {
    const date = parseEventDate(row.eventDate);
    const monthKey = row.eventDate.slice(0, 7);

    let month = months.at(-1);
    if (month?.key !== monthKey) {
      month = {
        key: monthKey,
        label: monthFormatter.format(date),
        days: [],
      };
      months.push(month);
    }

    const day = month.days.at(-1);
    if (day?.iso === row.eventDate) {
      day.rows.push(row);
    } else {
      month.days.push({
        iso: row.eventDate,
        label: dateFormatter.format(date),
        rows: [row],
      });
    }
  }

  return months;
}

/** Counts rows per calendar date, for the calendar grid. */
export function countByDate(rows: readonly { eventDate: string }[]) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    counts.set(row.eventDate, (counts.get(row.eventDate) ?? 0) + 1);
  }

  return counts;
}
