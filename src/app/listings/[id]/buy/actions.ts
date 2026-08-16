'use server';

import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { db } from '@/db';
import { claimListing, ownLiveHold } from '@/db/claim-listing';
import { events, listings } from '@/db/schema';
import type { BuyFormState, BuyFormValues } from '@/lib/buy-form-state';
import { buyInputSchema } from '@/lib/buy-input';
import { isWithinRiskWindow } from '@/lib/event-timing';
import { todayIso } from '@/lib/events';
import { isBuyable } from '@/lib/hold';
import { buyerFeeInPence, buyerTotalInPence } from '@/lib/money';

/**
 * Reads the submitted values without trusting their types, as the listing form
 * does. A crafted multipart body can send a file where a string belongs; that
 * degrades to '' and fails validation rather than reaching the database.
 */
function readValues(formData: FormData): BuyFormValues {
  const read = (name: string) => {
    const raw = formData.get(name);
    return typeof raw === 'string' ? raw : '';
  };

  return {
    fullName: read('fullName'),
    email: read('email'),
    acceptFinalSale: read('acceptFinalSale'),
    acceptRisk: read('acceptRisk'),
  };
}

function failed(
  values: BuyFormValues,
  formError: string,
  raceLost = false
): BuyFormState {
  return { formError, raceLost, fieldErrors: {}, values };
}

export async function startPurchase(
  _prevState: BuyFormState,
  formData: FormData
): Promise<BuyFormState> {
  const values = readValues(formData);

  // Auth inside the action, not only on the page: a Server Action is reachable
  // by direct POST. `auth.protect()` is wrong here — an action POST is a
  // non-document request, so it 404s instead of redirecting to sign-in, and
  // the buyer loses what they typed.
  const { userId } = await auth();
  if (userId === null) {
    return failed(values, 'Sign in to buy this place.');
  }

  const listingId = formData.get('listingId');
  const parsedId = z.uuid().safeParse(listingId);
  if (!parsedId.success) {
    return failed(values, 'Something went wrong. Please start again.');
  }

  const [listing] = await db
    .select({
      id: listings.id,
      sellerId: listings.sellerId,
      status: listings.status,
      holdExpiresAt: listings.holdExpiresAt,
      askingPriceInPence: listings.askingPriceInPence,
      eventDate: events.eventDate,
    })
    .from(listings)
    .innerJoin(events, eq(listings.eventId, events.id))
    .where(eq(listings.id, parsedId.data))
    .limit(1);

  if (!listing) {
    return failed(values, 'That listing is no longer available.');
  }

  if (listing.sellerId === userId) {
    return failed(values, 'This is your own listing.');
  }

  // The event-date check the claim cannot make. It has to stay out of the
  // claim's predicate, which must be answerable from the `listings` row alone
  // so that Postgres' lock on that one row is what serialises the race. Doing
  // it here is sound rather than a compromise: an event's date does not move,
  // so reading it a moment earlier gives the same answer.
  if (listing.eventDate < todayIso()) {
    return failed(values, 'That track day has already taken place.');
  }

  const now = new Date();
  const riskWarningRequired = isWithinRiskWindow(listing.eventDate, now);

  const parsed = buyInputSchema(riskWarningRequired).safeParse(values);
  if (!parsed.success) {
    return {
      formError: null,
      raceLost: false,
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
      values,
    };
  }

  if (!isBuyable(listing, now)) {
    // Somebody else has it. Resume first: if the holder is this buyer, they
    // are looking at their own hold, and telling them it is "being bought" is
    // both wrong and alarming.
    const own = await ownLiveHold(listing.id, userId);
    if (own) {
      redirect(`/purchases/${own.purchaseId}`);
    }
    return failed(
      values,
      'Someone else started buying this a moment ago. If they do not finish, it comes back by itself.',
      true
    );
  }

  const claim = await claimListing({
    listingId: listing.id,
    buyerId: userId,
    askingPriceInPence: listing.askingPriceInPence,
    buyerFeeInPence: buyerFeeInPence(listing.askingPriceInPence),
    totalInPence: buyerTotalInPence(listing.askingPriceInPence),
    riskWarningRequired,
    // Guaranteed non-'on' only when the warning was not required — validation
    // above refuses the submit otherwise.
    riskAcceptedAt: riskWarningRequired ? now : null,
    buyerDetails: { fullName: parsed.data.fullName, email: parsed.data.email },
  });

  if (!claim.ok) {
    // Lost the race between the check above and the UPDATE, or the price moved.
    // Resume before the race-loser path here too: two submits of this form in
    // flight at once would otherwise tell the buyer that they had outbid
    // themselves.
    const own = await ownLiveHold(listing.id, userId);
    if (own) {
      redirect(`/purchases/${own.purchaseId}`);
    }
    return failed(
      values,
      'Someone else got there first. If they do not finish, it comes back by itself.',
      true
    );
  }

  redirect(`/purchases/${claim.purchaseId}`);
}
