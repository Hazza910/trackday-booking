import { and, asc, count, eq, gte } from 'drizzle-orm';
import Link from 'next/link';

import { MonthCalendar } from '@/components/month-calendar';
import { db } from '@/db';
import { events, listings } from '@/db/schema';
import { buildMonthGrids } from '@/lib/calendar';
import {
  PROVIDER_LABEL,
  dateFormatter,
  groupByMonth,
  parseEventDate,
  todayIso,
} from '@/lib/events';
import {
  countByDate,
  eventAnchorId,
  forSaleLabel,
  withDateAnchors,
} from '@/lib/listings-view';
import { accentBadgeClassName, badgeClassName } from '@/lib/ui';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const upcoming = await db
    .select({
      id: events.id,
      provider: events.provider,
      title: events.title,
      circuit: events.circuit,
      eventDate: events.eventDate,
      sourceUrl: events.sourceUrl,
      // count(listings.id), not count(): a bare count() emits count(*), which
      // counts the NULL-extended row of the left join and would report 1 for
      // an event with no listings at all.
      activeListings: count(listings.id),
    })
    .from(events)
    .leftJoin(
      listings,
      // The status test belongs in the ON clause. In WHERE it would discard
      // the NULL-extended rows, quietly turning this into an inner join and
      // dropping every event that has no listings.
      and(eq(listings.eventId, events.id), eq(listings.status, 'active'))
    )
    .where(gte(events.eventDate, todayIso()))
    .groupBy(events.id)
    .orderBy(asc(events.eventDate), asc(events.circuit), asc(events.title));

  // The calendar counts events per day; the anchors give each of those days
  // somewhere to land without adding a heading per date to a list of 86.
  const calendarMonths = buildMonthGrids(countByDate(upcoming));
  const months = groupByMonth(withDateAnchors(upcoming));

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
        <>
          <MonthCalendar months={calendarMonths} noun="event" />
          {months.map((month) => (
          <section key={month.label} className="mt-10">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              {month.label}
            </h2>
            <ul className="mt-3 flex flex-col gap-2">
              {month.events.map((event) => (
                <li
                  key={event.id}
                  id={event.anchorId ?? undefined}
                  className="flex scroll-mt-6 flex-col gap-1 rounded-lg border border-black/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 dark:border-white/15"
                >
                  <span className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={badgeClassName}>
                        {PROVIDER_LABEL[event.provider]}
                      </span>
                      {/* The title carries the outbound link: an internal link
                          for the listings cannot be nested inside an anchor,
                          so the row can no longer be one. */}
                      <a
                        href={event.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {event.title}
                      </a>
                      {event.activeListings > 0 && (
                        <Link
                          href={`/listings#${eventAnchorId(event.id)}`}
                          className={accentBadgeClassName}
                        >
                          {forSaleLabel(event.activeListings)}
                        </Link>
                      )}
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
                </li>
              ))}
            </ul>
          </section>
          ))}
        </>
      )}
    </main>
  );
}
