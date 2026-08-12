import { sql } from 'drizzle-orm';

import { db } from './index';
import { events } from './schema';

/**
 * Seeds the curated event directory from published provider schedules.
 *
 * Idempotency: upsert on the natural key (provider, circuit, event_date,
 * title), backed by the unique constraint added in migration 0004. Existing
 * rows are updated in place and new ones inserted, so `events.id` is stable
 * across runs and listings can safely reference these rows —
 * `listings.event_id` is `ON DELETE restrict`, which the previous
 * delete-and-reinsert would have hit the moment a seller listed.
 *
 * Not handled: rows in the database that have dropped out of the source
 * schedule (a cancelled event). They are reported but never deleted — a
 * delete would fail against any listing that references the event, and
 * cancelling an event that someone has sold a place at needs a human
 * decision, not a seed script.
 *
 * Transcription rules applied to the source listings:
 * - Track layout folded into the circuit name ("Donington Park GP").
 * - All dates are 2026.
 * - Circuito de Navarra events omitted — UK only for v1.
 * - No Limits events are titled "Track Day", or "Track Evening" where the
 *   source listing is marked as an evening.
 */

const MSV_SOURCE_URL = 'https://bike.msvtrackdays.com';
const NOLIMITS_SOURCE_URL = 'https://www.nolimitstrackdays.com';

/**
 * Circuit-name normalisation applied across both providers.
 *
 * The two providers publish the same circuit under different names — MSV
 * always states the layout, No Limits often doesn't. These aliases pin the
 * layout where it is certain, so both providers' events for one circuit group
 * under a single name.
 *
 * Deliberately not listed: Cadwell Park, Mallory Park, Croft, Lydden Hill and
 * Brands Hatch Indy. Their layout either wasn't specified or isn't certain, so
 * they stay exactly as published.
 *
 * Keys are exact matches. MSV's Donington entries are always qualified
 * ("Donington Park GP", "Donington Park National"), so the bare
 * "Donington Park" key only ever rewrites No Limits events.
 */
const CIRCUIT_ALIASES: Record<string, string> = {
  Snetterton: 'Snetterton 300',
  'Oulton Park': 'Oulton Park International',
  'Donington Park': 'Donington Park GP',
};

function normaliseCircuit(circuit: string) {
  return CIRCUIT_ALIASES[circuit] ?? circuit;
}

type SeedEvent = {
  /** ISO calendar date — the column is a Postgres `date`. */
  eventDate: string;
  title: string;
  circuit: string;
};

const MSV_EVENTS: SeedEvent[] = [
  // August
  { eventDate: '2026-08-12', title: 'General Track Day', circuit: 'Donington Park GP' },
  { eventDate: '2026-08-12', title: 'General Track Evening', circuit: 'Donington Park GP' },
  { eventDate: '2026-08-12', title: 'General Track Day', circuit: 'Snetterton 300' },
  { eventDate: '2026-08-17', title: 'Licence Course and Track Evening', circuit: 'Donington Park GP' },
  { eventDate: '2026-08-17', title: 'Novice Only Trackday', circuit: 'Donington Park GP' },
  { eventDate: '2026-08-17', title: 'General Track Day', circuit: 'Snetterton 300' },
  { eventDate: '2026-08-17', title: 'General Track Evening', circuit: 'Snetterton 300' },
  { eventDate: '2026-08-19', title: 'Road Bike Track Day', circuit: 'Oulton Park International' },
  { eventDate: '2026-08-20', title: 'General Track Day', circuit: 'Brands Hatch GP' },
  { eventDate: '2026-08-22', title: 'General Track Day', circuit: 'Cadwell Park Full Circuit' },
  { eventDate: '2026-08-24', title: 'General Track Day', circuit: 'Bedford Autodrome South West' },
  { eventDate: '2026-08-25', title: 'Carole Nash Track Day', circuit: 'Cadwell Park Full Circuit' },
  { eventDate: '2026-08-25', title: 'General Track Evening', circuit: 'Donington Park GP' },
  { eventDate: '2026-08-25', title: 'Unsilenced Track Day', circuit: 'Donington Park GP' },
  { eventDate: '2026-08-31', title: 'General Track Day', circuit: 'Donington Park GP' },
  // September
  { eventDate: '2026-09-02', title: 'General Track Day', circuit: 'Brands Hatch Indy' },
  { eventDate: '2026-09-02', title: 'General Track Evening', circuit: 'Brands Hatch Indy' },
  { eventDate: '2026-09-02', title: 'General Track Day', circuit: 'Oulton Park International' },
  { eventDate: '2026-09-03', title: 'General Track Day', circuit: 'Cadwell Park Full Circuit' },
  { eventDate: '2026-09-03', title: 'General Track Evening', circuit: 'Cadwell Park Full Circuit' },
  { eventDate: '2026-09-04', title: 'Novice Only Trackday', circuit: 'Cadwell Park Full Circuit' },
  { eventDate: '2026-09-07', title: 'General Track Day', circuit: 'Donington Park National' },
  { eventDate: '2026-09-07', title: 'General Track Evening', circuit: 'Donington Park GP' },
  { eventDate: '2026-09-07', title: 'Novice Only Trackday', circuit: 'Snetterton 300' },
  { eventDate: '2026-09-08', title: 'Unsilenced Track Day', circuit: 'Donington Park GP' },
  { eventDate: '2026-09-08', title: 'General Track Day', circuit: 'Snetterton 300' },
  { eventDate: '2026-09-14', title: 'General Track Day', circuit: 'Bedford Autodrome South West' },
  { eventDate: '2026-09-14', title: 'General Track Day', circuit: 'Brands Hatch Indy' },
  { eventDate: '2026-09-16', title: 'Novice Only Trackday with Demon Tweeks', circuit: 'Oulton Park International' },
  { eventDate: '2026-09-18', title: 'General Track Day', circuit: 'Cadwell Park Full Circuit' },
  { eventDate: '2026-09-21', title: 'General Track Day', circuit: 'Donington Park GP' },
  { eventDate: '2026-09-25', title: 'Classic and Retro Bike Track Day', circuit: 'Cadwell Park Full Circuit' },
  { eventDate: '2026-09-26', title: 'General Track Day', circuit: 'Snetterton 300' },
  { eventDate: '2026-09-28', title: 'General Track Day', circuit: 'Brands Hatch Indy' },
  { eventDate: '2026-09-29', title: 'General Track Day', circuit: 'Oulton Park International' },
  { eventDate: '2026-09-30', title: 'Carole Nash Track Day', circuit: 'Donington Park National' },
];

const NOLIMITS_EVENTS: SeedEvent[] = [
  // August
  { eventDate: '2026-08-14', title: 'Track Day', circuit: 'Anglesey International' },
  { eventDate: '2026-08-15', title: 'Track Day', circuit: 'Donington Park' },
  { eventDate: '2026-08-15', title: 'Track Day', circuit: 'Oulton Park' },
  { eventDate: '2026-08-16', title: 'Track Day', circuit: 'Donington Park' },
  { eventDate: '2026-08-17', title: 'Track Day', circuit: 'Cadwell Park' },
  { eventDate: '2026-08-17', title: 'Track Evening', circuit: 'Cadwell Park' },
  { eventDate: '2026-08-22', title: 'Track Day', circuit: 'Mallory Park' },
  { eventDate: '2026-08-23', title: 'Track Day', circuit: 'Anglesey International' },
  { eventDate: '2026-08-24', title: 'Track Day', circuit: 'Donington Park' },
  { eventDate: '2026-08-25', title: 'Track Day', circuit: 'Brands Hatch Indy' },
  { eventDate: '2026-08-25', title: 'Track Evening', circuit: 'Brands Hatch Indy' },
  { eventDate: '2026-08-26', title: 'Track Day', circuit: 'Oulton Park' },
  { eventDate: '2026-08-27', title: 'Track Day', circuit: 'Croft' },
  { eventDate: '2026-08-27', title: 'Track Day', circuit: 'Donington Park' },
  { eventDate: '2026-08-27', title: 'Track Evening', circuit: 'Donington Park' },
  { eventDate: '2026-08-28', title: 'Track Day', circuit: 'Croft' },
  { eventDate: '2026-08-31', title: 'Track Day', circuit: 'Lydden Hill' },
  { eventDate: '2026-08-31', title: 'Track Day', circuit: 'Mallory Park' },
  // September
  { eventDate: '2026-09-04', title: 'Track Day', circuit: 'Mallory Park' },
  { eventDate: '2026-09-06', title: 'Track Day', circuit: 'Cadwell Park' },
  { eventDate: '2026-09-07', title: 'Track Day', circuit: 'Cadwell Park' },
  { eventDate: '2026-09-10', title: 'Track Day', circuit: 'Donington Park' },
  { eventDate: '2026-09-10', title: 'Track Evening', circuit: 'Donington Park' },
  { eventDate: '2026-09-10', title: 'Track Day', circuit: 'Croft' },
  { eventDate: '2026-09-11', title: 'Track Day', circuit: 'Croft' },
  { eventDate: '2026-09-12', title: 'Track Day', circuit: 'Oulton Park' },
  { eventDate: '2026-09-12', title: 'Track Day', circuit: 'Mallory Park' },
  { eventDate: '2026-09-14', title: 'Track Day', circuit: 'Snetterton' },
  { eventDate: '2026-09-18', title: 'Track Day', circuit: 'Donington Park' },
  { eventDate: '2026-09-19', title: 'Track Day', circuit: 'Oulton Park' },
  { eventDate: '2026-09-21', title: 'Track Day', circuit: 'Cadwell Park' },
  { eventDate: '2026-09-25', title: 'Track Day', circuit: 'Mallory Park' },
  { eventDate: '2026-09-26', title: 'Track Day', circuit: 'Anglesey International' },
  { eventDate: '2026-09-26', title: 'Track Day', circuit: 'Lydden Hill' },
  // October
  { eventDate: '2026-10-01', title: 'Track Day', circuit: 'Oulton Park' },
  { eventDate: '2026-10-01', title: 'Track Day', circuit: 'Brands Hatch Indy' },
  { eventDate: '2026-10-02', title: 'Track Day', circuit: 'Mallory Park' },
  { eventDate: '2026-10-03', title: 'Track Day', circuit: 'Cadwell Park' },
  { eventDate: '2026-10-03', title: 'Track Day', circuit: 'Snetterton' },
  { eventDate: '2026-10-04', title: 'Track Day', circuit: 'Snetterton' },
  { eventDate: '2026-10-04', title: 'Track Day', circuit: 'Cadwell Park' },
  { eventDate: '2026-10-05', title: 'Track Day', circuit: 'Cadwell Park' },
  { eventDate: '2026-10-08', title: 'Track Day', circuit: 'Donington Park' },
  { eventDate: '2026-10-09', title: 'Track Day', circuit: 'Donington Park' },
  { eventDate: '2026-10-17', title: 'Track Day', circuit: 'Mallory Park' },
  { eventDate: '2026-10-25', title: 'Track Day', circuit: 'Cadwell Park' },
  { eventDate: '2026-10-27', title: 'Track Day', circuit: 'Brands Hatch Indy' },
  { eventDate: '2026-10-29', title: 'Track Day', circuit: 'Donington Park' },
  { eventDate: '2026-10-30', title: 'Track Day', circuit: 'Oulton Park' },
  { eventDate: '2026-10-31', title: 'Track Day', circuit: 'Donington Park' },
];

/** The natural key, as a string, for comparing seed rows against stored ones. */
function naturalKey(event: {
  provider: string;
  circuit: string;
  eventDate: string;
  title: string;
}) {
  return [event.provider, event.circuit, event.eventDate, event.title].join(
    ' '
  );
}

async function seed() {
  const rows = [
    ...MSV_EVENTS.map((event) => ({
      ...event,
      circuit: normaliseCircuit(event.circuit),
      provider: 'msv' as const,
      sourceUrl: MSV_SOURCE_URL,
    })),
    ...NOLIMITS_EVENTS.map((event) => ({
      ...event,
      circuit: normaliseCircuit(event.circuit),
      provider: 'nolimits' as const,
      sourceUrl: NOLIMITS_SOURCE_URL,
    })),
  ];

  // Postgres rejects an ON CONFLICT DO UPDATE whose own VALUES list hits the
  // same key twice ("cannot affect row a second time"). Catch that here, where
  // the message can name the offending event.
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const row of rows) {
    const key = naturalKey(row);
    if (seen.has(key)) {
      duplicates.add(key);
    }
    seen.add(key);
  }
  if (duplicates.size > 0) {
    throw new Error(`duplicate seed keys: ${[...duplicates].join('; ')}`);
  }

  const stored = await db
    .select({
      provider: events.provider,
      circuit: events.circuit,
      eventDate: events.eventDate,
      title: events.title,
    })
    .from(events);
  const storedKeys = new Set(stored.map(naturalKey));
  const seedKeys = new Set(rows.map(naturalKey));

  await db
    .insert(events)
    .values(rows)
    .onConflictDoUpdate({
      target: [events.provider, events.circuit, events.eventDate, events.title],
      set: { sourceUrl: sql`excluded.source_url` },
    });

  const updated = rows.filter((row) => storedKeys.has(naturalKey(row))).length;
  const inserted = rows.length - updated;
  const stale = stored.filter((row) => !seedKeys.has(naturalKey(row)));

  console.log(
    `events: ${inserted} inserted, ${updated} updated ` +
      `(msv ${MSV_EVENTS.length}, nolimits ${NOLIMITS_EVENTS.length})`
  );
  if (stale.length > 0) {
    console.warn(
      `${stale.length} stored event(s) are no longer in the source schedule ` +
        `and were left untouched:`
    );
    for (const row of stale) {
      console.warn(
        `  ${row.provider} | ${row.circuit} | ${row.eventDate} | ${row.title}`
      );
    }
  }
}

seed()
  .then(() => {
    console.log('seed complete');
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('seed failed:', error);
    process.exit(1);
  });
