import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

import { db } from '@/db';
import { listings } from '@/db/schema';
import { env } from '@/env';
import {
  BLANK_SELLER_COLUMNS,
  sellerColumnsFromPayload,
  userDeletedPayloadSchema,
  userUpdatedPayloadSchema,
} from '@/lib/clerk-webhook';
import {
  AUTO_WITHDRAWABLE_STATUSES,
  ERASABLE_STATUSES,
  MID_SALE_STATUSES,
} from '@/lib/listing-status';

/**
 * Keeps the denormalised seller names on `listings` in step with Clerk.
 *
 * A Route Handler rather than a Server Action because the caller is Clerk, not
 * our own UI — the one case CLAUDE.md allows one for.
 *
 * The proxy lets this through unauthenticated: `src/proxy.ts` only calls
 * `auth.protect()` for `/dashboard` and `/account`, and Clerk's handshake
 * redirect cannot fire on a POST. Trust therefore comes from the signature
 * alone, which is verified before anything is read.
 */

/** Clerk retries on a 5xx, so transient failures should be 5xx, not 200. */
function ok() {
  return new Response(null, { status: 204 });
}

// Typed as NextRequest, not Request: that is what Next hands a Route Handler,
// and it is what `verifyWebhook` accepts — no cast required.
export async function POST(request: NextRequest) {
  if (env.CLERK_WEBHOOK_SIGNING_SECRET === undefined) {
    // Fails closed. Without the secret nothing can be verified, and processing
    // an unverified payload would let anyone rename or withdraw any listing.
    console.error('clerk webhook: CLERK_WEBHOOK_SIGNING_SECRET is not set');
    return new Response('Webhook not configured', { status: 500 });
  }

  let event;
  try {
    // Consumes the request body; it cannot be read again afterwards.
    event = await verifyWebhook(request, {
      signingSecret: env.CLERK_WEBHOOK_SIGNING_SECRET,
    });
  } catch (error: unknown) {
    // Clerk re-wraps signature failures as a plain Error, so there is no typed
    // class to narrow on here.
    console.error('clerk webhook: signature verification failed', error);
    return new Response('Invalid signature', { status: 400 });
  }

  if (event.type === 'user.updated') {
    const parsed = userUpdatedPayloadSchema.safeParse(event.data);
    if (!parsed.success) {
      console.error('clerk webhook: unusable user.updated payload', parsed.error);
      return new Response('Invalid payload', { status: 400 });
    }

    await db
      .update(listings)
      .set(sellerColumnsFromPayload(parsed.data))
      .where(
        and(
          eq(listings.sellerId, parsed.data.id),
          // Deliveries are neither ordered nor once-only. A `user.updated`
          // retried after the account was deleted would otherwise write the
          // erased name straight back, and no second `user.deleted` is ever
          // sent to undo it.
          isNull(listings.sellerDeletedAt)
        )
      );

    return ok();
  }

  if (event.type === 'user.deleted') {
    const parsed = userDeletedPayloadSchema.safeParse(event.data);
    if (!parsed.success) {
      console.error('clerk webhook: user.deleted without an id', parsed.error);
      return new Response('Invalid payload', { status: 400 });
    }

    const sellerId = parsed.data.id;

    // Read the mid-sale rows first, so what gets flagged is the state at the
    // moment of deletion rather than whatever survives the writes below.
    const midSale = await db
      .select({ id: listings.id, status: listings.status })
      .from(listings)
      .where(
        and(
          eq(listings.sellerId, sellerId),
          inArray(listings.status, [...MID_SALE_STATUSES])
        )
      );

    if (midSale.length > 0) {
      // Deliberately left untouched — a sale with money or an obligation
      // attached is a dispute for a human, and both the seller's name and the
      // status are evidence of what state it was in.
      console.error(
        'clerk webhook: deleted seller has mid-sale listings needing review',
        { sellerId, listings: midSale }
      );
    }

    // Tombstone first, and on every row including the mid-sale ones: from this
    // point a `user.updated` retry cannot resurrect the name. It records that
    // the account is gone, not that the sale changed, so it guards a mid-sale
    // row without transitioning it.
    await db
      .update(listings)
      .set({ sellerDeletedAt: new Date() })
      .where(eq(listings.sellerId, sellerId));

    // Withdraw before erasing, not after. The other order has a window where
    // an active row has been stripped of its name and can still be taken to
    // pending by a buyer — losing the evidence precisely on the row that
    // would then need it. This way a listing that goes pending first is
    // simply missed by both writes and stays whole.
    await db
      .update(listings)
      .set({ status: 'withdrawn' })
      .where(
        and(
          eq(listings.sellerId, sellerId),
          inArray(listings.status, [...AUTO_WITHDRAWABLE_STATUSES])
        )
      );

    await db
      .update(listings)
      .set(BLANK_SELLER_COLUMNS)
      .where(
        and(
          eq(listings.sellerId, sellerId),
          // Built from the partition rather than a second copy of the list, so
          // this cannot drift from the rule listing-status.test.ts enforces.
          inArray(listings.status, [...ERASABLE_STATUSES])
        )
      );

    return ok();
  }

  // Anything else is acknowledged so Clerk stops retrying it.
  return ok();
}
