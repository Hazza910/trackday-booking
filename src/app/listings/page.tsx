import { and, asc, eq, gte, or } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';

import { MonthCalendar } from '@/components/month-calendar';
import { db } from '@/db';
import {
  buyableListing,
  heldByViewer,
  viewerHoldsItColumn,
} from '@/db/listing-predicates';
import { events, listings, purchases } from '@/db/schema';
import { buildMonthGrids, dateAnchorId } from '@/lib/calendar';
import { todayIso } from '@/lib/events';
import { formatHoldRemaining, holdRemainingMs } from '@/lib/hold';
import {
  countByDate,
  groupByMonthAndDay,
  withEventAnchors,
} from '@/lib/listings-view';
import { sellerDisplayName } from '@/lib/seller-names';

import { ListingCard } from './listing-card';

/**
 * Per-request, because the root layout's Clerk `Show` makes every route in
 * this app dynamic regardless of what is declared here.
 *
 * That used to matter: this page called the Clerk Backend API once per render,
 * on a public route, against a quota shared with signed-in paths. The seller
 * name is now denormalised onto `listings` and kept current by the
 * `user.updated` webhook, so rendering the board is one database query and
 * nothing else.
 */
export const dynamic = 'force-dynamic';

export default async function ListingsPage() {
  const { userId } = await auth();
  const now = new Date();

  // Columns are listed explicitly: bookingReference, holdExpiresAt and
  // currentPurchaseId have no business on a public page. sellerId is not
  // selected at all any more: the seller's name is denormalised onto the row,
  // so nothing here needs their identity.
  const rows = await db
    .select({
      id: listings.id,
      eventId: listings.eventId,
      sellerUsername: listings.sellerUsername,
      sellerFirstName: listings.sellerFirstName,
      sellerDeletedAt: listings.sellerDeletedAt,
      groupLevel: listings.groupLevel,
      askingPriceInPence: listings.askingPriceInPence,
      originalPriceInPence: listings.originalPriceInPence,
      notes: listings.notes,
      // A boolean computed in SQL, not the buyer's id. A lapsed-hold listing is
      // returned to everyone, and selecting the previous holder's Clerk id onto
      // a public page's query — even unrendered — is the thing this select
      // deliberately avoids everywhere else. The comparison happens in the
      // database; only the answer comes back.
      heldByYou: viewerHoldsItColumn(userId),
      holdExpiresAt: purchases.holdExpiresAt,
      eventTitle: events.title,
      circuit: events.circuit,
      eventDate: events.eventDate,
      provider: events.provider,
    })
    .from(listings)
    .innerJoin(events, eq(listings.eventId, events.id))
    .leftJoin(purchases, eq(purchases.id, listings.currentPurchaseId))
    // Not `status = 'active'`: a listing whose buyer's hold has run out is
    // available again, and nothing sweeps those back — the board is where the
    // release actually happens for a reader.
    //
    // The second clause puts a viewer's own held listing back on the board.
    // Buyability alone hides it, which left a buyer who navigated away with no
    // route back to a purchase they were part-way through paying for. For a
    // signed-out reader the clause is dropped entirely and nothing changes.
    .where(
      and(
        or(buyableListing(), heldByViewer(userId)),
        gte(events.eventDate, todayIso())
      )
    )
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
                    {day.rows.map((row) => {
                      // The query only returns a held listing to the person
                      // holding it — the permission lives in the predicate, so
                      // this only decides how it is presented.
                      const heldByYou = row.heldByYou === true;

                      return (
                      <li
                        key={row.id}
                        id={row.anchorId ?? undefined}
                        className="scroll-mt-6"
                      >
                        {heldByYou && (
                          <p className="mb-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-400">
                            You&rsquo;re part-way through buying this —{' '}
                            {formatHoldRemaining(
                              holdRemainingMs(row.holdExpiresAt, now)
                            )}
                          </p>
                        )}
                        <ListingCard
                          // The whole card goes to the buy page for the holder,
                          // so anywhere they tap continues the purchase. The
                          // buy page redirects a live hold to its purchase and
                          // shows the form again if it has lapsed, so this link
                          // stays right either way.
                          href={
                            heldByYou
                              ? `/listings/${row.id}/buy`
                              : `/listings/${row.id}`
                          }
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
                            sellerName: sellerDisplayName({
                              username: row.sellerUsername,
                              firstName: row.sellerFirstName,
                              deletedAt: row.sellerDeletedAt,
                            }),
                          }}
                        />
                      </li>
                      );
                    })}
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
