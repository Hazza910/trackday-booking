'use client';

import { useEffect, useState } from 'react';

/**
 * Counts a hold down.
 *
 * Takes the remaining milliseconds measured on the server rather than the
 * expiry timestamp, and ticks down from there. The expiry belongs to the
 * database's clock, and a browser whose clock is a few minutes out would
 * otherwise show a hold that had already expired — or one with far too long
 * left, which is worse.
 */
export function HoldCountdown({ remainingMs }: { remainingMs: number }) {
  const [remaining, setRemaining] = useState(remainingMs);

  useEffect(() => {
    if (remaining <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setRemaining((value) => Math.max(0, value - 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [remaining]);

  if (remaining <= 0) {
    return <span>Your hold has expired.</span>;
  }

  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return (
    <span className="tabular-nums">
      {minutes}:{String(seconds).padStart(2, '0')} left
    </span>
  );
}
