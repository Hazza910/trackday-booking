'use client';

import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useCallback, useMemo } from 'react';

import { fetchCheckoutClientSecret } from './actions';

/**
 * Stripe's embedded Checkout, so the buyer pays without leaving the site.
 *
 * Card details are handled inside Stripe's iframe and never touch our code or
 * our servers — that is the whole reason for using their component rather than
 * building the form.
 *
 * The publishable key arrives as a prop. It could not be imported from
 * `src/env.ts`: that module validates `CLERK_SECRET_KEY`, so importing it from
 * a Client Component would throw in the browser where the secret is absent.
 */
export function Checkout({
  purchaseId,
  publishableKey,
}: {
  purchaseId: string;
  publishableKey: string;
}) {
  // `loadStripe` returns a promise that must be stable across renders —
  // recreating it remounts the iframe and loses whatever the buyer has typed.
  const stripePromise = useMemo(
    () => loadStripe(publishableKey),
    [publishableKey]
  );

  const fetchClientSecret = useCallback(
    () => fetchCheckoutClientSecret(purchaseId),
    [purchaseId]
  );

  return (
    <div className="mt-6">
      <EmbeddedCheckoutProvider
        stripe={stripePromise}
        options={{ fetchClientSecret }}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
