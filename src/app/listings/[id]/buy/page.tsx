import { auth, currentUser } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { db } from '@/db';
import { ownLiveHold } from '@/db/claim-listing';
import { events, listings } from '@/db/schema';
import { isWithinRiskWindow } from '@/lib/event-timing';
import { PROVIDER_LABEL, dateFormatter, parseEventDate, todayIso } from '@/lib/events';
import { GROUP_LEVEL_LABELS } from '@/lib/group-levels';
import { listingAvailability } from '@/lib/hold';
import { buyerFeeInPence, buyerTotalInPence, formatPence } from '@/lib/money';

import { BuyForm } from './buy-form';

export const dynamic = 'force-dynamic';

function Blocked({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">{children}</p>
      <p className="mt-6 text-sm">
        <Link href="/listings" className="underline underline-offset-4">
          Back to the Paddock Board
        </Link>
      </p>
    </main>
  );
}

/**
 * The signed-in account's primary email, for prefilling only. Degrades to no
 * prefill rather than failing the page — the buyer can type it, and validation
 * happens on what they submit either way.
 */
async function buyerEmail() {
  try {
    const user = await currentUser();
    return user?.primaryEmailAddress?.emailAddress ?? '';
  } catch (error: unknown) {
    console.error('buy page: could not read the buyer email', error);
    return '';
  }
}

export default async function BuyPage(props: PageProps<'/listings/[id]/buy'>) {
  const { id } = await props.params;

  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  const [listing] = await db
    .select({
      id: listings.id,
      sellerId: listings.sellerId,
      status: listings.status,
      holdExpiresAt: listings.holdExpiresAt,
      groupLevel: listings.groupLevel,
      askingPriceInPence: listings.askingPriceInPence,
      eventTitle: events.title,
      circuit: events.circuit,
      eventDate: events.eventDate,
      provider: events.provider,
    })
    .from(listings)
    .innerJoin(events, eq(listings.eventId, events.id))
    .where(eq(listings.id, parsedId.data))
    .limit(1);

  if (!listing) {
    notFound();
  }

  const { userId } = await auth();

  // Resume before anything else can call this listing unavailable. A buyer who
  // navigates back here while holding it would otherwise be told somebody is
  // buying the thing they are already buying.
  if (userId !== null) {
    const own = await ownLiveHold(listing.id, userId);
    if (own) {
      redirect(`/purchases/${own.purchaseId}`);
    }
  }

  if (userId !== null && userId === listing.sellerId) {
    return (
      <Blocked heading="This is your own listing">
        You cannot buy a place you are selling.
      </Blocked>
    );
  }

  if (listing.eventDate < todayIso()) {
    return (
      <Blocked heading="That track day has passed">
        This event has already taken place, so the place can no longer be
        transferred.
      </Blocked>
    );
  }

  const now = new Date();
  const availability = listingAvailability(listing, now);

  if (availability === 'being-bought') {
    return (
      <Blocked heading="Someone is buying this">
        Another buyer is part-way through. If they do not finish, the listing
        comes back by itself — try again in a few minutes.
      </Blocked>
    );
  }

  if (availability === 'unavailable') {
    return (
      <Blocked heading="This place has gone">
        It is no longer for sale. There may be other places at the same event.
      </Blocked>
    );
  }

  // One Clerk Backend API call, only for a signed-in buyer on a page they
  // reached deliberately. The quota worry that drove denormalising seller names
  // was anonymous traffic on public pages hitting Clerk on every render; this
  // is neither. A failure here costs a prefill, not the sale.
  const defaultEmail = userId === null ? '' : await buyerEmail();

  const riskWarningRequired = isWithinRiskWindow(listing.eventDate, now);
  const fee = buyerFeeInPence(listing.askingPriceInPence);
  const total = buyerTotalInPence(listing.askingPriceInPence);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">
        Buy this place
      </h1>

      <div className="mt-6 rounded-lg border border-black/10 p-4 dark:border-white/15">
        <p className="font-medium">{listing.eventTitle}</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {listing.circuit} · {PROVIDER_LABEL[listing.provider]} ·{' '}
          {GROUP_LEVEL_LABELS[listing.groupLevel]}
        </p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          <time dateTime={listing.eventDate}>
            {dateFormatter.format(parseEventDate(listing.eventDate))}
          </time>
        </p>

        {/* The fee is its own line, never folded into the price. A buyer should
            be able to see what the seller asked and what we added. */}
        <dl className="mt-4 flex flex-col gap-1 border-t border-black/10 pt-4 text-sm dark:border-white/15">
          <div className="flex justify-between">
            <dt className="text-zinc-600 dark:text-zinc-400">Asking price</dt>
            <dd className="tabular-nums">{formatPence(listing.askingPriceInPence)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-600 dark:text-zinc-400">Buyer fee (5%)</dt>
            <dd className="tabular-nums">{formatPence(fee)}</dd>
          </div>
          <div className="flex justify-between font-medium">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatPence(total)}</dd>
          </div>
        </dl>
      </div>

      <BuyForm
        listingId={listing.id}
        riskWarningRequired={riskWarningRequired}
        isSignedIn={userId !== null}
        defaultEmail={defaultEmail}
      />
    </main>
  );
}
