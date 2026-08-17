import type { NextRequest } from 'next/server';
import type Stripe from 'stripe';

import {
  markOrphaned,
  markPaid,
  purchaseForSession,
  type PaymentOutcome,
} from '@/db/record-payment';
import { env } from '@/env';
import { transferDeadlineAt } from '@/lib/event-timing';
import { stripe } from '@/lib/stripe';

/**
 * Stripe's side of the payment.
 *
 * A Route Handler rather than a Server Action because the caller is Stripe —
 * the one case CLAUDE.md allows one for. Its own endpoint, separate from
 * Clerk's, and the production URL must use **www.thepaddockboard.com**: the
 * bare domain 308-redirects and webhook deliveries do not follow redirects.
 * That cost us a morning with Clerk; it is written down here so it does not
 * cost another.
 *
 * The buyer's browser is never trusted to confirm payment — it controls the
 * return URL. This is the only thing that moves a purchase to `paid`.
 */

/** Stripe retries on a 5xx, so transient failures must be 5xx, not 200. */
function ok() {
  return new Response(null, { status: 204 });
}

function describe(outcome: PaymentOutcome) {
  switch (outcome.kind) {
    case 'paid':
      return `paid: purchase ${outcome.purchaseId}, listing ${outcome.listingId}`;
    case 'orphaned':
      return `orphaned: purchase ${outcome.purchaseId}`;
    case 'already-recorded':
      return `already recorded: purchase ${outcome.purchaseId}`;
    case 'unknown-session':
      return 'no purchase carries this session id';
  }
}

async function handleCompletedSession(
  session: Stripe.Checkout.Session
): Promise<PaymentOutcome> {
  const purchase = await purchaseForSession(session.id);
  if (purchase === null) {
    return { kind: 'unknown-session' };
  }

  if (purchase.state === 'paid' || purchase.state === 'orphaned') {
    // A replay, or two deliveries racing. Nothing to do, and saying so is not
    // an error — Stripe is allowed to deliver more than once.
    return { kind: 'already-recorded', purchaseId: purchase.id };
  }

  // What Stripe says arrived, not what we asked for. They should match; if they
  // ever do not, the money is the fact and the difference is worth shouting
  // about rather than quietly storing our own number.
  const amountPaidInPence = session.amount_total ?? 0;
  if (amountPaidInPence !== purchase.totalInPence) {
    console.error('stripe webhook: amount paid does not match the quote', {
      purchaseId: purchase.id,
      quoted: purchase.totalInPence,
      paid: amountPaidInPence,
    });
  }

  // The listing has moved on if it no longer points at this purchase. The
  // purchase's own state says the same thing when a later claim expired it —
  // both are checked, because a listing that was withdrawn or sold by another
  // route leaves the purchase untouched at `held`.
  const listingMovedOn = purchase.currentPurchaseId !== purchase.id;
  if (purchase.state === 'expired' || listingMovedOn) {
    const orphanedId = await markOrphaned({
      stripeSessionId: session.id,
      amountPaidInPence,
    });
    return orphanedId === null
      ? { kind: 'already-recorded', purchaseId: purchase.id }
      : { kind: 'orphaned', purchaseId: orphanedId };
  }

  const paid = await markPaid({
    stripeSessionId: session.id,
    amountPaidInPence,
    transferDeadlineAt: transferDeadlineAt(new Date(), purchase.eventDate),
  });

  if (paid === null) {
    // Lost to a concurrent delivery, or the listing moved between the read
    // above and the write. Re-deciding from a fresh read would risk a loop, so
    // this hands it to the orphan path, which is conditional and safe to run
    // when it turns out not to apply.
    const orphanedId = await markOrphaned({
      stripeSessionId: session.id,
      amountPaidInPence,
    });
    return orphanedId === null
      ? { kind: 'already-recorded', purchaseId: purchase.id }
      : { kind: 'orphaned', purchaseId: orphanedId };
  }

  return { kind: 'paid', purchaseId: paid.purchaseId, listingId: paid.listingId };
}

export async function POST(request: NextRequest) {
  const client = stripe();
  if (client === null || env.STRIPE_WEBHOOK_SIGNING_SECRET === undefined) {
    // Fails closed, like the Clerk route. Without the secret nothing can be
    // verified, and acting on an unverified payload would let anyone mark any
    // listing paid.
    console.error('stripe webhook: not configured');
    return new Response('Webhook not configured', { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (signature === null) {
    return new Response('Missing signature', { status: 400 });
  }

  // The raw body, before any parsing: the signature is over these exact bytes,
  // and re-serialising parsed JSON would not reproduce them.
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    // The async variant, which uses SubtleCrypto and works on either runtime.
    event = await client.webhooks.constructEventAsync(
      payload,
      signature,
      env.STRIPE_WEBHOOK_SIGNING_SECRET
    );
  } catch (error: unknown) {
    console.error('stripe webhook: signature verification failed', error);
    return new Response('Invalid signature', { status: 400 });
  }

  if (event.type !== 'checkout.session.completed') {
    // Acknowledged so Stripe stops retrying. Only one event type moves money
    // in this flow; the rest are noise until refunds exist.
    return ok();
  }

  try {
    const outcome = await handleCompletedSession(event.data.object);

    if (outcome.kind === 'orphaned') {
      // A buyer has paid for something they cannot be given. Console-only for
      // now, which is not good enough — the alert is routed through the
      // notification module in the next PR, along with the seller's sold email.
      console.error(
        'stripe webhook: PAYMENT NEEDS A REFUND — listing had already gone',
        { purchaseId: outcome.purchaseId, sessionId: event.data.object.id }
      );
    } else {
      console.log(`stripe webhook: ${describe(outcome)}`);
    }

    return ok();
  } catch (error: unknown) {
    // A 5xx so Stripe retries. The writes are conditional, so a retry after a
    // partial failure re-decides from the current state rather than doubling
    // anything up.
    console.error('stripe webhook: could not record the payment', error);
    return new Response('Could not record the payment', { status: 500 });
  }
}
