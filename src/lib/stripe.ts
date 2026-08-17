import Stripe from 'stripe';

import { env } from '@/env';

/**
 * The server-side Stripe client.
 *
 * Server-only: it closes over the secret key, and this module must never be
 * reached from a Client Component. The publishable key travels to the browser
 * as a prop instead — `env.ts` validates `CLERK_SECRET_KEY`, so importing it
 * client-side would throw regardless.
 *
 * Returns null rather than throwing when the key is absent, so that callers
 * have to decide what a missing configuration means for them. The one thing it
 * must never mean is a 500 on a page that would otherwise work.
 */
let client: Stripe | null = null;

export function stripe() {
  if (env.STRIPE_SECRET_KEY === undefined) {
    return null;
  }

  // Built once and reused: the constructor sets up an HTTP agent, and making a
  // fresh one per request leaks connections under load.
  client ??= new Stripe(env.STRIPE_SECRET_KEY);
  return client;
}

/** Whether payment is configured at all. Cheap enough to call in a render. */
export function isStripeConfigured() {
  return (
    env.STRIPE_SECRET_KEY !== undefined &&
    env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY !== undefined
  );
}
