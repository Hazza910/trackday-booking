import { and, asc, eq, gte } from 'drizzle-orm';
import Link from 'next/link';

import { MonthCalendar } from '@/components/month-calendar';
import { db } from '@/db';
import { events, listings } from '@/db/schema';
import { buildMonthGrids, dateAnchorId } from '@/lib/calendar';
import { todayIso } from '@/lib/events';
import {
  countByDate,
  groupByMonthAndDay,
  withEventAnchors,
} from '@/lib/listings-view';
import { SELLER_FALLBACK_NAME } from '@/lib/seller-names';
import { resolveSellerNames } from '@/lib/sellers';

import { ListingCard } from './listing-card';

/**
 * Per-request, and not by choice.
 *
 * `export const revalidate` was tried here and does nothing: the root layout's
 * Clerk `Show` reads auth state, which makes every route in the app dynamic —
 * `next build` marks even `/_not-found` as server-rendered on demand, and that
 * page fetches nothing. So this page cannot be cached at the route level while
 * the header renders signed-in state.
 *
 * That leaves the Clerk fan-out below uncapped against anonymous traffic:
 * every hit on this public page costs one batch of Backend API calls, against
 * a quota shared with signed-in paths like `/account`. Flagged in the PR
 * rather than papered over — the fix is either caching the name lookup with a
 * request-independent client, or denormalising the display name onto
 * `listings` from a Clerk webhook, which needs a migration.
 */
export const dynamic = 'force-dynamic';

export default async function ListingsPage() {
  // Columns are listed explicitly: bookingReference, buyerId, stripeSessionId
  // and holdExpiresAt have no business on a public page. sellerId is selected
  // only to feed the Clerk batch, and never reaches the card.
  const rows = await db
    .select({
      id: listings.id,
      eventId: listings.eventId,
      sellerId: listings.sellerId,
      groupLevel: listings.groupLevel,
      askingPriceInPence: listings.askingPriceInPence,
      originalPriceInPence: listings.originalPriceInPence,
      notes: listings.notes,
      eventTitle: events.title,
      circuit: events.circuit,
      eventDate: events.eventDate,
      provider: events.provider,
    })
    .from(listings)
    .innerJoin(events, eq(listings.eventId, events.id))
    .where(and(eq(listings.status, 'active'), gte(events.eventDate, todayIso())))
    .orderBy(
      asc(events.eventDate),
      asc(listings.askingPriceInPence),
      // Deterministic tiebreak, so two listings at the same price on the same
      // day do not swap places between renders.
      asc(listings.id)
    )
    // A ceiling on a single render. Well above anything the board will hold
    // for a long while; when it stops being enough, this needs paging rather
    // than a bigger number.
    .limit(500);

  // One batched lookup for the whole page rather than one call per listing.
  const sellerNames = await resolveSellerNames(rows.map((row) => row.sellerId));

  const months = groupByMonthAndDay(withEventAnchors(rows));
  const calendarMonths = buildMonthGrids(countByDate(rows));

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        Paddock Board
      </h1>
      <p className="mt-3 max-w-prose text-zinc-600 dark:text-zinc-400">
        Places at UK track days, sold on by riders who can no longer make the
        date. The seller transfers the booking to you through the
        provider&rsquo;s own name-change process.
      </p>

      {rows.length === 0 ? (
        <p className="mt-10 rounded-lg border border-dashed border-black/15 px-6 py-10 text-center text-zinc-500 dark:border-white/20">
          Nothing listed yet. If you have a track day you can&rsquo;t make,{' '}
          <Link href="/sell" className="underline underline-offset-4">
            list it here
          </Link>
          .
        </p>
      ) : (
        <>
          <MonthCalendar months={calendarMonths} />

          {months.map((month) => (
            <section key={month.key} className="mt-12">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {month.label}
              </h2>

              {month.days.map((day) => (
                <section
                  key={day.iso}
                  id={dateAnchorId(day.iso)}
                  // Keeps the heading clear of the header when the browser
                  // jumps to this anchor.
                  className="mt-6 scroll-mt-6"
                >
                  <h3 className="text-sm font-medium">
                    <time dateTime={day.iso}>{day.label}</time>
                  </h3>

                  <ul className="mt-3 flex flex-col gap-3">
                    {day.rows.map((row) => (
                      <li
                        key={row.id}
                        id={row.anchorId ?? undefined}
                        className="scroll-mt-6"
                      >
                        <ListingCard
                          href={`/listings/${row.id}`}
                          listing={{
                            id: row.id,
                            eventTitle: row.eventTitle,
                            circuit: row.circuit,
                            eventDate: row.eventDate,
                            provider: row.provider,
                            groupLevel: row.groupLevel,
                            askingPriceInPence: row.askingPriceInPence,
                            originalPriceInPence: row.originalPriceInPence,
                            notes: row.notes,
                            sellerName:
                              sellerNames.get(row.sellerId) ?? SELLER_FALLBACK_NAME,
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </section>
          ))}
        </>
      )}
    </main>
  );
}
