'use server';

import { auth, currentUser } from '@clerk/nextjs/server';
import { and, eq, gte } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { db } from '@/db';
import { events, listings } from '@/db/schema';
import {
  BLANK_SELLER_COLUMNS,
  type SellerNameColumns,
} from '@/lib/clerk-webhook';
import { todayIso } from '@/lib/events';
import type {
  ListingFormState,
  ListingFormValues,
} from '@/lib/listing-form-state';
import { listingInputSchema, type ListingInput } from '@/lib/listing-input';

/**
 * Reads the submitted values without trusting their types. `FormData.get`
 * returns `string | File | null`, and a crafted multipart body can send a file
 * where a string belongs — that degrades to an empty string and fails
 * validation, rather than reaching the database.
 */
function readValues(formData: FormData): ListingFormValues {
  const read = (name: string) => {
    const raw = formData.get(name);
    return typeof raw === 'string' ? raw : '';
  };

  return {
    eventId: read('eventId'),
    groupLevel: read('groupLevel'),
    askingPrice: read('askingPrice'),
    originalPrice: read('originalPrice'),
    bookingReference: read('bookingReference'),
    notes: read('notes'),
  };
}

type InsertResult = { ok: true; id: string } | { ok: false };

/**
 * Reads the seller's public name fields for denormalising onto the listing.
 *
 * A failure here must not cost the seller their listing, so it degrades to no
 * name — the listing shows "A seller" until their next profile change fires
 * the `user.updated` webhook. Flagged in the PR: nothing re-syncs a listing
 * whose capture failed and whose owner never edits their profile again.
 */
async function captureSellerName(): Promise<SellerNameColumns> {
  try {
    const user = await currentUser();
    return {
      sellerUsername: user?.username?.trim() || null,
      sellerFirstName: user?.firstName?.trim() || null,
    };
  } catch (error: unknown) {
    console.error('createListing: could not read the seller name', error);
    return BLANK_SELLER_COLUMNS;
  }
}

/**
 * Isolated so that `redirect` — which signals by throwing — never has to sit
 * inside a `try` block.
 */
async function insertListing(
  input: ListingInput,
  sellerId: string,
  sellerName: SellerNameColumns
): Promise<InsertResult> {
  try {
    const [created] = await db
      .insert(listings)
      .values({
        eventId: input.eventId,
        sellerId,
        sellerUsername: sellerName.sellerUsername,
        sellerFirstName: sellerName.sellerFirstName,
        groupLevel: input.groupLevel,
        askingPriceInPence: input.askingPrice,
        originalPriceInPence: input.originalPrice,
        bookingReference: input.bookingReference,
        notes: input.notes,
        // `status` is left to the column default so 'active' has one home.
      })
      .returning({ id: listings.id });

    return created ? { ok: true, id: created.id } : { ok: false };
  } catch (error: unknown) {
    console.error('createListing: insert failed', error);
    return { ok: false };
  }
}

export async function createListing(
  _prevState: ListingFormState,
  formData: FormData
): Promise<ListingFormState> {
  const values = readValues(formData);

  // Auth first, and inside the action rather than relying on the page: a
  // Server Action is reachable by direct POST, not only through our own form.
  // `auth.protect()` is wrong here — an action POST is a non-document request,
  // so it 404s instead of redirecting to sign-in, and the seller loses what
  // they typed.
  const { userId } = await auth();
  if (userId === null) {
    return {
      formError: 'Sign in to publish your listing.',
      fieldErrors: {},
      values,
    };
  }

  const parsed = listingInputSchema.safeParse(values);
  if (!parsed.success) {
    return {
      formError: 'Check the highlighted fields and try again.',
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
      values,
    };
  }

  // The dropdown is client-supplied, so the event is re-checked here — it must
  // exist and still be upcoming, using the same definition of "today" the
  // dropdown was built from.
  const [event] = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(eq(events.id, parsed.data.eventId), gte(events.eventDate, todayIso()))
    )
    .limit(1);

  if (!event) {
    return {
      formError: null,
      fieldErrors: {
        eventId: ['That event is no longer available. Please pick another.'],
      },
      values,
    };
  }

  // The seller's name is copied onto the listing here so that rendering one
  // never has to call Clerk. This is the only Clerk lookup in the flow, and it
  // happens on a mutation rather than on every page view.
  const inserted = await insertListing(
    parsed.data,
    userId,
    await captureSellerName()
  );
  if (!inserted.ok) {
    return {
      formError: 'Could not save your listing. Please try again.',
      fieldErrors: {},
      values,
    };
  }

  redirect(`/listings/${inserted.id}`);
}
