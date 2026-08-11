import { asc, gte } from 'drizzle-orm';
import { db } from '@/db';
import { events } from '@/db/schema';

export const dynamic = 'force-dynamic';

const PROVIDER_LABEL = {
  msv: 'MSV',
  nolimits: 'No Limits',
} as const;

/**
 * `event_date` is a Postgres `date`, which Drizzle returns as `YYYY-MM-DD`.
 * Format it in UTC so a calendar date never shifts by a day.
 */
const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const monthFormatter = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function parseEventDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default async function Home() {
  const upcoming = await db
    .select()
    .from(events)
    .where(gte(events.eventDate, todayIso()))
    .orderBy(asc(events.eventDate), asc(events.circuit), asc(events.title));

  // Group into months, preserving the date ordering from the query.
  const months: Array<{ label: string; events: typeof upcoming }> = [];
  for (const event of upcoming) {
    const label = monthFormatter.format(parseEventDate(event.eventDate));
    const last = months.at(-1);
    if (last?.label === label) {
      last.events.push(event);
    } else {
      months.push({ label, events: [event] });
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        Upcoming UK track days
      </h1>
      <p className="mt-3 max-w-prose text-zinc-600 dark:text-zinc-400">
        Every date we track from MSV and No Limits. Listings attach to these
        events, so a buyer always knows the circuit, date and rider group.
      </p>

      {months.length === 0 ? (
        <p className="mt-10 rounded-lg border border-dashed border-black/15 px-6 py-10 text-center text-zinc-500 dark:border-white/20">
          No upcoming events just now. Please check back soon.
        </p>
      ) : (
        months.map((month) => (
          <section key={month.label} className="mt-10">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              {month.label}
            </h2>
            <ul className="mt-3 flex flex-col gap-2">
              {month.events.map((event) => (
                <li
                  key={event.id}
                  className="rounded-lg border border-black/10 dark:border-white/15"
                >
                  <a
                    href={event.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col gap-1 p-4 transition-colors hover:bg-black/[.03] sm:flex-row sm:items-center sm:justify-between sm:gap-4 dark:hover:bg-white/[.06]"
                  >
                    <span className="flex flex-col gap-1">
                      <span className="flex items-center gap-2">
                        <span className="rounded border border-black/15 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-600 dark:border-white/25 dark:text-zinc-300">
                          {PROVIDER_LABEL[event.provider]}
                        </span>
                        <span className="font-medium">{event.title}</span>
                      </span>
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">
                        {event.circuit}
                      </span>
                    </span>
                    <time
                      dateTime={event.eventDate}
                      className="shrink-0 text-sm tabular-nums text-zinc-500"
                    >
                      {dateFormatter.format(parseEventDate(event.eventDate))}
                    </time>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
