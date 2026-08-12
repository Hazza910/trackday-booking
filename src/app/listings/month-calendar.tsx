import { WEEKDAY_INITIALS, dateAnchorId, type CalendarMonth } from '@/lib/calendar';

/**
 * Month grids for jumping into the list below.
 *
 * A Server Component: every day is a plain anchor to a `#date-…` id, so the
 * browser does the scrolling and nothing here needs to run on the client.
 */
export function MonthCalendar({ months }: { months: readonly CalendarMonth[] }) {
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
                // Two Tuesdays' worth of "T" and two "S"es, so the index is the
                // only thing that distinguishes them.
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
                  aria-label={`${day.count} listing${day.count === 1 ? '' : 's'} on ${day.iso}`}
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
