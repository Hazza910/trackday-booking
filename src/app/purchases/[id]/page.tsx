import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { db } from '@/db';
import { events, listings, purchases } from '@/db/schema';
import { env } from '@/env';
import { PROVIDER_LABEL, dateFormatter, parseEventDate } from '@/lib/events';
import { GROUP_LEVEL_LABELS } from '@/lib/group-levels';
import { holdRemainingMs, isHoldLive } from '@/lib/hold';
import { formatPence } from '@/lib/money';
import { isStripeConfigured } from '@/lib/stripe';

import { Checkout } from './checkout';
import { ConfirmingPayment } from './confirming-payment';
import { HoldCountdown } from './hold-countdown';

export const dynamic = 'force-dynamic';

export default async function PurchasePage(props: PageProps<'/purchases/[id]'>) {
  const { id } = await props.params;

  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  const { userId } = await auth();
  if (userId === null) {
    const { redirectToSignIn } = await auth();
    return redirectToSignIn();
  }

  const [purchase] = await db
    .select({
      id: purchases.id,
      buyerId: purchases.buyerId,
      state: purchases.state,
      askingPriceInPence: purchases.askingPriceInPence,
      buyerFeeInPence: purchases.buyerFeeInPence,
      totalInPence: purchases.totalInPence,
      holdExpiresAt: purchases.holdExpiresAt,
      listingId: purchases.listingId,
      eventTitle: events.title,
      circuit: events.circuit,
      eventDate: events.eventDate,
      provider: events.provider,
      groupLevel: listings.groupLevel,
    })
    .from(purchases)
    .innerJoin(listings, eq(purchases.listingId, listings.id))
    .innerJoin(events, eq(listings.eventId, events.id))
    .where(eq(purchases.id, parsedId.data))
    .limit(1);

  if (!purchase) {
    notFound();
  }

  // Somebody else's purchase is not theirs to look at — and 404, not 403, so
  // the page does not confirm that a purchase with this id exists.
  if (purchase.buyerId !== userId) {
    notFound();
  }

  const now = new Date();
  const holdLive = isHoldLive(purchase.holdExpiresAt, now);

  // Only a hint that Stripe redirected here — never treated as proof of
  // payment. The buyer controls the query string; the webhook is what pays.
  const { session_id: sessionId } = await props.searchParams;
  const returnedFromStripe = typeof sessionId === 'string' && sessionId !== '';

  const paymentConfigured = isStripeConfigured();
  const publishableKey = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Your place</h1>

      <div className="mt-6 rounded-lg border border-black/10 p-4 dark:border-white/15">
        <p className="font-medium">{purchase.eventTitle}</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {purchase.circuit} · {PROVIDER_LABEL[purchase.provider]} ·{' '}
          {GROUP_LEVEL_LABELS[purchase.groupLevel]}
        </p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          <time dateTime={purchase.eventDate}>
            {dateFormatter.format(parseEventDate(purchase.eventDate))}
          </time>
        </p>

        <dl className="mt-4 flex flex-col gap-1 border-t border-black/10 pt-4 text-sm dark:border-white/15">
          <div className="flex justify-between">
            <dt className="text-zinc-600 dark:text-zinc-400">Asking price</dt>
            <dd className="tabular-nums">
              {formatPence(purchase.askingPriceInPence)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-600 dark:text-zinc-400">Buyer fee (5%)</dt>
            <dd className="tabular-nums">{formatPence(purchase.buyerFeeInPence)}</dd>
          </div>
          <div className="flex justify-between font-medium">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatPence(purchase.totalInPence)}</dd>
          </div>
        </dl>
      </div>

      {purchase.state === 'paid' ? (
        <div className="mt-6 rounded-lg border border-green-600/40 bg-green-500/5 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          <p className="font-medium">Paid — this place is yours.</p>
          <p className="mt-2">
            The seller has been told, and will transfer the booking into your
            name with the provider. We will let you know when that is done.
          </p>
        </div>
      ) : returnedFromStripe && holdLive ? (
        // Stripe has sent them back, but only the webhook can move the state.
        <div className="mt-6 rounded-lg border border-indigo-600/40 bg-indigo-500/5 px-4 py-3 text-sm text-indigo-700 dark:text-indigo-400">
          <p className="font-medium">Thanks — that went through.</p>
          <ConfirmingPayment />
        </div>
      ) : holdLive ? (
        <>
          <div className="mt-6 rounded-lg border border-indigo-600/40 bg-indigo-500/5 px-4 py-3 text-sm text-indigo-700 dark:text-indigo-400">
            <p className="font-medium">
              Your place is held —{' '}
              <HoldCountdown
                remainingMs={holdRemainingMs(purchase.holdExpiresAt, now)}
              />
            </p>
          </div>

          {paymentConfigured ? (
            <Checkout
              purchaseId={purchase.id}
              publishableKey={publishableKey}
            />
          ) : (
            <p className="mt-6 rounded-lg border border-amber-600/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              Payment is not switched on yet. Your place is still held — this is
              our side, not yours.
            </p>
          )}
        </>
      ) : (
        <div className="mt-6 rounded-lg border border-amber-600/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <p className="font-medium">Your hold has expired.</p>
          <p className="mt-2">
            Nobody has taken the place yet just because your hold ran out — if
            it is still listed, you can start again.
          </p>
          <p className="mt-2">
            <Link
              href={`/listings/${purchase.listingId}`}
              className="underline underline-offset-4"
            >
              Back to the listing
            </Link>
          </p>
        </div>
      )}
    </main>
  );
}
