import { WEEKDAY_INITIALS, dateAnchorId, type CalendarMonth } from '@/lib/calendar';
import { dateFormatter, parseEventDate } from '@/lib/events';

/**
 * Month grids for jumping into a dated list further down the page.
 *
 * A Server Component: every day is a plain anchor to a `#date-…` id, so the
 * browser does the scrolling and nothing here runs on the client. Shared by
 * the homepage (counting events) and `/listings` (counting listings), which
 * is what `noun` is for.
 */
export function MonthCalendar({
  months,
  noun = 'listing',
}: {
  readonly months: readonly CalendarMonth[];
  readonly noun?: string;
}) {
  return (
    <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {months.map((month) => (
        <section
          key={month.key}
          className="rounded-lg border border-black/10 p-4 dark:border-white/15"
        >
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            {month.label}
          </h2>

          <div className="mt-3 grid grid-cols-7 gap-1 text-center">
            {WEEKDAY_INITIALS.map((initial, index) => (
              <span
                // Two "T"s and two "S"es, so the index is the only thing that
                // tells one key from the other.
                key={`${initial}-${index}`}
                aria-hidden
                className="pb-1 text-[0.65rem] font-semibold uppercase text-zinc-400"
              >
                {initial}
              </span>
            ))}

            {month.weeks.flat().map((day, index) => {
              if (day === null) {
                return <span key={`blank-${index}`} />;
              }

              if (day.count === 0) {
                return (
                  <span
                    key={day.iso}
                    className="rounded py-1 text-sm tabular-nums text-zinc-400 dark:text-zinc-600"
                  >
                    {day.dayOfMonth}
                  </span>
                );
              }

              return (
                <a
                  key={day.iso}
                  href={`#${dateAnchorId(day.iso)}`}
                  // aria-label replaces the visible "17" entirely, so the date
                  // has to be spoken as a date rather than as an ISO string.
                  aria-label={`${day.count} ${noun}${day.count === 1 ? '' : 's'} on ${dateFormatter.format(parseEventDate(day.iso))}`}
                  className="rounded bg-indigo-500/10 py-1 text-sm font-semibold tabular-nums text-indigo-700 transition-colors hover:bg-indigo-500/20 dark:text-indigo-300"
                >
                  {day.dayOfMonth}
                </a>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
