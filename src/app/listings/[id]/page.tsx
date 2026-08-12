import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { db } from '@/db';
import { events, listings } from '@/db/schema';
import { dateFormatter, parseEventDate } from '@/lib/events';
import { resolveSellerName } from '@/lib/sellers';

import { ListingCard, ListingCardRow } from '../listing-card';

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
      eventTitle: events.title,
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
  const sellerName = await resolveSellerName(listing.sellerId);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      {isSeller && (
        <p className="mb-6 rounded-lg border border-green-600/40 bg-green-500/5 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          This is your listing.
        </p>
      )}

      <p className="mb-4 text-sm text-zinc-500">
        <time dateTime={listing.eventDate}>
          {dateFormatter.format(parseEventDate(listing.eventDate))}
        </time>
        {listing.status !== 'active' && ` · ${listing.status}`}
      </p>

      {/* The card's data type forbids bookingReference and sellerId outright,
          so the reference can only be rendered here, gated on isSeller. */}
      <ListingCard
        headingLevel="h1"
        listing={{
          id: listing.id,
          eventTitle: listing.eventTitle,
          circuit: listing.circuit,
          eventDate: listing.eventDate,
          provider: listing.provider,
          groupLevel: listing.groupLevel,
          askingPriceInPence: listing.askingPriceInPence,
          originalPriceInPence: listing.originalPriceInPence,
          notes: listing.notes,
          sellerName,
        }}
      >
        {isSeller && (
          <ListingCardRow
            label="Your booking reference"
            valueClassName="font-mono text-sm"
          >
            {listing.bookingReference}
          </ListingCardRow>
        )}
      </ListingCard>

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
