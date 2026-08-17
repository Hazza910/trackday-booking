'use server';

import { auth } from '@clerk/nextjs/server';
import { and, eq, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db';
import { purchases } from '@/db/schema';
import { checkoutSessionParams } from '@/lib/checkout-session';
import { isHoldLive } from '@/lib/hold';
import { stripe } from '@/lib/stripe';

/**
 * Creates — or recovers — the Stripe Checkout session for a purchase, and hands
 * back the client secret the embedded form needs.
 *
 * Called by `EmbeddedCheckoutProvider`'s `fetchClientSecret`, which is why it
 * returns a bare string or throws: that is the contract Stripe's component
 * expects, and a thrown error surfaces as the component's own error state
 * rather than a broken page.
 */

/**
 * Where Stripe sends the buyer back to.
 *
 * Taken from the request rather than an environment variable, so it is always
 * the host the buyer is actually on. That matters here in the same way it does
 * for the webhook endpoint: www.thepaddockboard.com and the bare domain are not
 * interchangeable, and a return_url pointing at the wrong one sends the buyer
 * through a redirect at the worst possible moment.
 */
async function appOrigin() {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? '';
  const protocol =
    requestHeaders.get('x-forwarded-proto') ??
    (host.startsWith('localhost') ? 'http' : 'https');

  return `${protocol}://${host}`;
}

export async function fetchCheckoutClientSecret(
  purchaseId: string
): Promise<string> {
  const parsedId = z.uuid().safeParse(purchaseId);
  if (!parsedId.success) {
    throw new Error('Unknown purchase.');
  }

  const { userId } = await auth();
  if (userId === null) {
    throw new Error('Sign in to pay.');
  }

  const client = stripe();
  if (client === null) {
    // Fails closed. The page checks this too and does not render the form at
    // all, so reaching here means a direct call.
    console.error('checkout: STRIPE_SECRET_KEY is not set');
    throw new Error('Payment is not available just now.');
  }

  const [purchase] = await db
    .select({
      id: purchases.id,
      buyerId: purchases.buyerId,
      state: purchases.state,
      holdExpiresAt: purchases.holdExpiresAt,
      askingPriceInPence: purchases.askingPriceInPence,
      buyerFeeInPence: purchases.buyerFeeInPence,
      totalInPence: purchases.totalInPence,
      stripeSessionId: purchases.stripeSessionId,
    })
    .from(purchases)
    .where(eq(purchases.id, parsedId.data))
    .limit(1);

  if (!purchase || purchase.buyerId !== userId) {
    // Same answer for "does not exist" and "is not yours", so this cannot be
    // used to discover which purchase ids are real.
    throw new Error('Unknown purchase.');
  }

  if (purchase.state !== 'held') {
    throw new Error('This purchase is no longer open for payment.');
  }

  if (!isHoldLive(purchase.holdExpiresAt, new Date())) {
    throw new Error('Your hold has expired.');
  }

  // Recover an existing session rather than opening a second one. A buyer who
  // refreshes would otherwise leave a trail of live sessions against one
  // purchase, and `stripe_session_id` is unique — a second session could not be
  // recorded against the row, so the webhook would never find it.
  if (purchase.stripeSessionId !== null) {
    const existing = await client.checkout.sessions.retrieve(
      purchase.stripeSessionId
    );

    if (existing.status === 'open' && existing.client_secret !== null) {
      return existing.client_secret;
    }

    // Not reusable, and deliberately not replaced. Verified against the API:
    // an expired session returns a null `client_secret`, so there is nothing
    // to hand back, and opening a replacement would strand it behind the
    // unique column. Both branches below are close to unreachable — the hold
    // is ten minutes and a session lasts thirty, so a live hold outliving its
    // session cannot normally happen — but they say something true rather than
    // failing obscurely if it ever does.
    throw new Error(
      existing.status === 'complete'
        ? 'That payment has already gone through. Give us a moment to confirm it.'
        : 'This payment session has expired. Go back to the listing and start again.'
    );
  }

  const session = await client.checkout.sessions.create(
    checkoutSessionParams({
      purchaseId: purchase.id,
      askingPriceInPence: purchase.askingPriceInPence,
      buyerFeeInPence: purchase.buyerFeeInPence,
      returnUrl: `${await appOrigin()}/purchases/${purchase.id}?session_id={CHECKOUT_SESSION_ID}`,
      nowSeconds: Math.floor(Date.now() / 1000),
    })
  );

  if (session.client_secret === null) {
    throw new Error('Payment could not be started.');
  }

  // Conditional, so two tabs racing cannot overwrite each other's session id.
  // The loser's session is simply abandoned and expires on Stripe's side; what
  // must not happen is the row pointing at a session the webhook will not see.
  const stored = await db
    .update(purchases)
    .set({ stripeSessionId: session.id })
    .where(
      and(
        eq(purchases.id, purchase.id),
        eq(purchases.state, 'held'),
        isNull(purchases.stripeSessionId)
      )
    )
    .returning({ id: purchases.id });

  if (stored.length === 0) {
    // Another tab got there first. Use whatever it stored rather than this
    // session, so the row and the form agree.
    const [current] = await db
      .select({ stripeSessionId: purchases.stripeSessionId })
      .from(purchases)
      .where(eq(purchases.id, purchase.id))
      .limit(1);

    if (current?.stripeSessionId != null) {
      const winner = await client.checkout.sessions.retrieve(
        current.stripeSessionId
      );
      if (winner.status === 'open' && winner.client_secret !== null) {
        return winner.client_secret;
      }
    }
    throw new Error('Payment could not be started.');
  }

  return session.client_secret;
}
