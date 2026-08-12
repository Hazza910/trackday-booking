import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { db } from '@/db';
import { events, listings } from '@/db/schema';
import { PROVIDER_LABEL, dateFormatter, parseEventDate } from '@/lib/events';
import { GROUP_LEVEL_LABELS } from '@/lib/group-levels';
import { formatPence } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function ListingPage(props: PageProps<'/listings/[id]'>) {
  const { id } = await props.params;

  // Validate before querying: Postgres rejects a malformed uuid with 22P02,
  // which would surface as a 500 where a 404 is the honest answer.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  const [listing] = await db
    .select({
      id: listings.id,
      sellerId: listings.sellerId,
      groupLevel: listings.groupLevel,
      askingPriceInPence: listings.askingPriceInPence,
      originalPriceInPence: listings.originalPriceInPence,
      bookingReference: listings.bookingReference,
      notes: listings.notes,
      status: listings.status,
      title: events.title,
      circuit: events.circuit,
      eventDate: events.eventDate,
      provider: events.provider,
      sourceUrl: events.sourceUrl,
    })
    .from(listings)
    .innerJoin(events, eq(listings.eventId, events.id))
    .where(eq(listings.id, parsedId.data))
    .limit(1);

  if (!listing) {
    notFound();
  }

  const { userId } = await auth();
  const isSeller = userId !== null && userId === listing.sellerId;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      {isSeller && (
        <p className="mb-6 rounded-lg border border-green-600/40 bg-green-500/5 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          Your listing is live.
        </p>
      )}

      <div className="flex items-center gap-2">
        <span className="rounded border border-black/15 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-600 dark:border-white/25 dark:text-zinc-300">
          {PROVIDER_LABEL[listing.provider]}
        </span>
        <span className="rounded border border-black/15 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-600 dark:border-white/25 dark:text-zinc-300">
          {listing.status}
        </span>
      </div>

      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        {listing.circuit}
      </h1>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">
        {listing.title} ·{' '}
        <time dateTime={listing.eventDate}>
          {dateFormatter.format(parseEventDate(listing.eventDate))}
        </time>
      </p>

      <dl className="mt-8 flex flex-col gap-4 rounded-lg border border-black/10 p-5 dark:border-white/15">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-sm text-zinc-600 dark:text-zinc-400">
            Asking price
          </dt>
          <dd className="text-2xl font-semibold tabular-nums">
            {formatPence(listing.askingPriceInPence)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-sm text-zinc-600 dark:text-zinc-400">
            Seller paid
          </dt>
          <dd className="tabular-nums text-zinc-600 dark:text-zinc-400">
            {formatPence(listing.originalPriceInPence)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-sm text-zinc-600 dark:text-zinc-400">Group</dt>
          <dd>{GROUP_LEVEL_LABELS[listing.groupLevel]}</dd>
        </div>
        {isSeller && (
          // The booking reference is the asset: whoever holds it could try to
          // action the name change. Only ever rendered for the seller.
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-sm text-zinc-600 dark:text-zinc-400">
              Your booking reference
            </dt>
            <dd className="font-mono text-sm">{listing.bookingReference}</dd>
          </div>
        )}
      </dl>

      {listing.notes !== null && (
        <p className="mt-6 whitespace-pre-line text-zinc-700 dark:text-zinc-300">
          {listing.notes}
        </p>
      )}

      <p className="mt-8 text-sm text-zinc-500">
        <a
          href={listing.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4"
        >
          See this event on the provider&rsquo;s site
        </a>
      </p>
    </main>
  );
}
