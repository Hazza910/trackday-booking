/**
 * Shared presentation helpers for the event directory.
 *
 * The homepage, the sell form and the create-listing action all need to agree
 * on what "upcoming" means and where a month starts. Keeping that in one place
 * means the dropdown can never offer an event the action would then reject.
 */

export const PROVIDER_LABEL = {
  msv: 'MSV',
  nolimits: 'No Limits',
} as const;

/**
 * A native `<option>` renders text and nothing else, so the whole description
 * of an event is flattened into one label on the server.
 */
export type EventOption = { readonly id: string; readonly label: string };

export type EventOptionGroup = {
  readonly label: string;
  readonly options: readonly EventOption[];
};

/**
 * `event_date` is a Postgres `date`, which Drizzle returns as `YYYY-MM-DD`.
 * Format it in UTC so a calendar date never shifts by a day.
 */
export const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export const shortDateFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

export const monthFormatter = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function parseEventDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Groups date-ordered rows into months, preserving the order they arrived in.
 * The caller is responsible for the ordering; this only inserts the breaks.
 */
export function groupByMonth<T extends { eventDate: string }>(rows: readonly T[]) {
  const months: Array<{ label: string; events: T[] }> = [];

  for (const row of rows) {
    const label = monthFormatter.format(parseEventDate(row.eventDate));
    const last = months.at(-1);
    if (last?.label === label) {
      last.events.push(row);
    } else {
      months.push({ label, events: [row] });
    }
  }

  return months;
}

/**
 * Flattens date-ordered events into `<optgroup>`-ready month groups. Every
 * display string is built here, on the server, so the browser never needs a
 * date library or an `Intl` formatter.
 */
export function toEventOptionGroups(
  rows: readonly {
    id: string;
    provider: keyof typeof PROVIDER_LABEL;
    title: string;
    circuit: string;
    eventDate: string;
  }[]
): EventOptionGroup[] {
  return groupByMonth(rows).map((month) => ({
    label: month.label,
    options: month.events.map((event) => ({
      id: event.id,
      label: [
        shortDateFormatter.format(parseEventDate(event.eventDate)),
        event.circuit,
        event.title,
        PROVIDER_LABEL[event.provider],
      ].join(' · '),
    })),
  }));
}
