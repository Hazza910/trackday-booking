'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * The gap between Stripe sending the buyer back and the webhook arriving.
 *
 * Stripe's redirect is not proof of payment — the browser controls it, so the
 * only thing that moves a purchase to `paid` is the webhook. That usually
 * lands within a second or two, but "usually" is not something to render a
 * receipt on, so this re-asks the server until the state changes.
 *
 * `router.refresh()` rather than fetching state through an action: the page
 * already reads the purchase on the server, and one source of truth beats two
 * that can disagree.
 */
const POLL_INTERVAL_MS = 2_000;

/** After this, stop asking and tell the buyer something useful instead. */
const GIVE_UP_AFTER_MS = 30_000;

export function ConfirmingPayment() {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    const poll = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    const giveUp = setTimeout(() => {
      setGaveUp(true);
      clearInterval(poll);
    }, GIVE_UP_AFTER_MS);

    return () => {
      clearInterval(poll);
      clearTimeout(giveUp);
    };
  }, [router]);

  if (gaveUp) {
    return (
      <p className="mt-2">
        This is taking longer than usual. Your payment has almost certainly gone
        through — nothing is lost, and the page updates by itself once it is
        confirmed. If it still says this in a few minutes, get in touch and we
        will sort it out.
      </p>
    );
  }

  return <p className="mt-2">Confirming your payment…</p>;
}
