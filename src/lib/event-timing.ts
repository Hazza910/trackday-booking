/**
 * Turning a track day's calendar date into the instants the buy flow needs.
 *
 * `events.event_date` is a Postgres `date` — a day, with no time on it — but
 * two rules in the buy flow need an instant: the at-your-own-risk warning
 * shown inside 48 hours of the event, and the seller's transfer deadline of
 * "48 hours before the event". Both therefore need an answer to "when does a
 * track day begin?", which the provider data does not currently carry.
 *
 * v1 answer: **00:00 Europe/London on the event date.** It is deliberately the
 * conservative end — it shows the warning earlier and sets the deadline
 * earlier than any real start time would — and it lives behind one constant,
 * so confirming the real gate times with MSV and No Limits changes this file
 * and nothing else.
 */

/** v1: a track day is treated as beginning at midnight, London time. */
export const EVENT_START_HOUR_LONDON = 0;

/**
 * 48 hours. One constant, used twice on purpose: it is both how close to the
 * event the risk warning appears and how far before the event the transfer
 * deadline lands. They are the same threshold seen from two sides — a buyer
 * inside it is buying a day whose transfer deadline has already passed — so
 * they must not be able to drift apart.
 */
export const RISK_WINDOW_MS = 48 * 60 * 60 * 1000;

/** 72 hours from payment. */
export const TRANSFER_WINDOW_MS = 72 * 60 * 60 * 1000;

const LONDON_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/**
 * The London wall-clock reading of an instant, expressed as the UTC timestamp
 * of those same digits. Subtracting the real instant from it gives London's
 * offset at that moment, which is the only way to do this without shipping a
 * timezone library.
 */
function londonWallClockAsUtcMs(instant: Date) {
  const parts: Record<string, string> = {};
  for (const part of LONDON_PARTS.formatToParts(instant)) {
    parts[part.type] = part.value;
  }

  return Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // `hour12: false` renders midnight as "24" in some ICU versions, which
    // would otherwise land this a whole day out.
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );
}

/**
 * The instant a track day on `eventDate` (an ISO `YYYY-MM-DD`) is treated as
 * starting.
 *
 * Converts a London wall-clock time to UTC by measuring the offset and
 * correcting for it, twice — one pass is enough except near a transition,
 * where the offset at the guess differs from the offset at the answer. The
 * hour this resolves is never itself ambiguous: the UK's clocks change at
 * 01:00 and 02:00, so midnight always exists exactly once.
 */
export function eventStartsAt(eventDate: string) {
  const [year, month, day] = eventDate.split('-').map(Number);
  const wallClock = Date.UTC(year, month - 1, day, EVENT_START_HOUR_LONDON);

  let instant = wallClock;
  for (let pass = 0; pass < 2; pass += 1) {
    instant = wallClock - (londonWallClockAsUtcMs(new Date(instant)) - instant);
  }

  return new Date(instant);
}

/**
 * Is the event close enough that the buyer must be warned they are buying at
 * their own risk? True once inside the window, and it stays true afterwards —
 * an event that has already started is not less risky than one that has not.
 */
export function isWithinRiskWindow(eventDate: string, now: Date) {
  return eventStartsAt(eventDate).getTime() - now.getTime() <= RISK_WINDOW_MS;
}

/**
 * When the seller must have completed the name change by: 72 hours after
 * payment, or 48 hours before the event, whichever comes first.
 *
 * Floored at the moment of payment. Buying inside the 48-hour window makes the
 * second of those a time that has already passed, and a deadline older than
 * the payment that created it is nonsense to anything reading the row later.
 * The floor renders it as "immediately", which is the honest reading — and it
 * is exactly the case the at-your-own-risk consent gate exists to warn about.
 */
export function transferDeadlineAt(paidAt: Date, eventDate: string) {
  const seventyTwoHours = paidAt.getTime() + TRANSFER_WINDOW_MS;
  const beforeEvent = eventStartsAt(eventDate).getTime() - RISK_WINDOW_MS;

  return new Date(Math.max(paidAt.getTime(), Math.min(seventyTwoHours, beforeEvent)));
}
