import type { NextRequest } from 'next/server';
import Stripe from 'stripe';

import {
  markOrphaned,
  markPaid,
  purchaseForSession,
  type PaymentOutcome,
} from '@/db/record-payment';
import { env } from '@/env';
import { transferDeadlineAt } from '@/lib/event-timing';
import { todayIso } from '@/lib/events';
import { decideEvent, decidePayment } from '@/lib/payment-decision';
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
 * The endpoint must be created with the **snapshot** payload format, pinned to
 * the API version the installed `stripe` package pins, and subscribed to the
 * three `checkout.session.*` types `decideEvent` handles. Stripe's Dashboard
 * now defaults new destinations to *thin* payloads. Those pass signature
 * verification, but the SDK refuses to build an event from them, so they would
 * never record a payment; the catch below names that case instead of calling
 * it a bad signature.
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

async function orphan(
  stripeSessionId: string,
  purchaseId: string,
  amountPaidInPence: number
): Promise<PaymentOutcome> {
  const orphanedId = await markOrphaned({ stripeSessionId, amountPaidInPence });
  return orphanedId === null
    ? { kind: 'already-recorded', purchaseId }
    : { kind: 'orphaned', purchaseId: orphanedId };
}

async function recordPayment(
  session: Stripe.Checkout.Session
): Promise<PaymentOutcome> {
  const purchase = await purchaseForSession(session.id);
  if (purchase === null) {
    return { kind: 'unknown-session' };
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

  const decision = decidePayment({
    state: purchase.state,
    purchaseId: purchase.id,
    currentPurchaseId: purchase.currentPurchaseId,
    // Checked here rather than in markPaid's WHERE: an event's date never
    // moves, so reading it a moment before the write gives the same answer.
    eventIsPast: purchase.eventDate < todayIso(),
  });

  switch (decision) {
    case 'already-recorded':
      // A replay, or two deliveries racing. Nothing to do, and saying so is
      // not an error — Stripe is allowed to deliver more than once.
      return { kind: 'already-recorded', purchaseId: purchase.id };

    case 'orphan':
      return orphan(session.id, purchase.id, amountPaidInPence);

    case 'pay': {
      const paid = await markPaid({
        stripeSessionId: session.id,
        amountPaidInPence,
        transferDeadlineAt: transferDeadlineAt(new Date(), purchase.eventDate),
      });

      if (paid === null) {
        // Lost to a concurrent delivery, or the listing moved between the read
        // above and the write. Re-deciding from a fresh read would risk a
        // loop, so this hands it to the orphan path, which is conditional and
        // matches nothing when it turns out not to apply.
        return orphan(session.id, purchase.id, amountPaidInPence);
      }

      if (paid.kind === 'listing-only') {
        // Thrown, not handled: the listing is sold and the purchase is not
        // paid, which the state machine says cannot happen. A retry cannot
        // repair it — markPaid will match nothing now — so this needs a human,
        // and the 500 keeps it red in Stripe's delivery log as well as here.
        throw new Error(
          `listing ${paid.listingId} marked paid but purchase ${paid.purchaseId} was not held`
        );
      }

      return {
        kind: 'paid',
        purchaseId: paid.purchaseId,
        listingId: paid.listingId,
      };
    }
  }
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
    // The message only, never the error object: Stripe's verification error
    // carries the whole payload as a property, and a Checkout Session payload
    // includes the buyer's name and email.
    if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
      console.error(
        `stripe webhook: signature verification failed: ${error.message}`
      );
      return new Response('Invalid signature', { status: 400 });
    }

    // Verified, but not an event this SDK can build. In practice that is a
    // thin payload — the SDK throws for those after the signature passes — so
    // the endpoint was created with the wrong payload format. A 400 keeps the
    // deliveries failing visibly in Stripe until it is fixed.
    console.error(
      'stripe webhook: verified payload is not a snapshot event — the endpoint must use the snapshot payload format',
      error instanceof Error ? error.message : 'unknown error'
    );
    return new Response('Unsupported event payload', { status: 400 });
  }

  if (
    event.type !== 'checkout.session.completed' &&
    event.type !== 'checkout.session.async_payment_succeeded' &&
    event.type !== 'checkout.session.async_payment_failed'
  ) {
    // Acknowledged so Stripe stops retrying, but never silently: the endpoint
    // subscribes to these three types only, so anything else means its
    // subscriptions have drifted.
    console.error(
      `stripe webhook: unexpected event type ${event.type} — check the endpoint's payload format and subscriptions`
    );
    return ok();
  }

  const session = event.data.object;

  switch (decideEvent(event.type, session.payment_status)) {
    case 'unexpected':
      // Unreachable given the guard above; kept so the switch stays exhaustive
      // if `decideEvent` ever learns a type the guard does not.
      console.error(`stripe webhook: unexpected event type ${event.type}`);
      return ok();

    case 'awaiting-async-payment':
      // The session completed but the money has not landed. Nothing moves:
      // the hold lapses as normal, and `async_payment_succeeded` records it if
      // it arrives — as an orphan if somebody else took the listing meanwhile.
      console.log(
        `stripe webhook: session ${session.id} completed unpaid (${session.payment_status}), awaiting async payment`
      );
      return ok();

    case 'async-payment-failed':
      // No state to change: the purchase is still `held` and its hold lapses
      // like any abandoned attempt.
      console.log(
        `stripe webhook: async payment failed for session ${session.id}`
      );
      return ok();

    case 'record-payment':
      break;
  }

  try {
    const outcome = await recordPayment(session);

    if (outcome.kind === 'orphaned') {
      // A buyer has paid for something they cannot be given.
      // TODO(notifications): console-only is not good enough. Route this
      // through the notifications module as an email to Harry before real
      // traffic — see the PR that introduced this route.
      console.error(
        'stripe webhook: PAYMENT NEEDS A REFUND — listing had already gone',
        { purchaseId: outcome.purchaseId, sessionId: session.id }
      );
    } else if (outcome.kind === 'unknown-session') {
      // Money arrived and no purchase row carries the session. Nothing in the
      // database will ever surface this one, so the log line is the only
      // record outside Stripe. TODO(notifications): same alert as above.
      console.error(
        'stripe webhook: PAYMENT NEEDS A REFUND — no purchase carries this session',
        {
          sessionId: session.id,
          purchaseIdFromMetadata: session.metadata?.purchaseId ?? null,
        }
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
