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
 * - `url` is the provider's own page for that one event, not a calendar
 *   landing page. Each was matched to its event on (provider, date, circuit
 *   base name, day-vs-evening) — circuit "base name" meaning the layout
 *   qualifier stripped from both sides, because the providers' calendars
 *   publish "Brands Hatch" where the event is really the Indy or the GP
 *   layout. That matching was a one-off; the URLs are literals here.
 */

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
  /** Deep link to this specific event on the provider's own site. */
  url: string;
};

const MSV_EVENTS: SeedEvent[] = [
  // August
  { eventDate: '2026-08-12', title: 'General Track Day', circuit: 'Donington Park GP', url: 'https://bike.msvtrackdays.com/calendar/bike/doningtonpark/2026/8/12' },
  { eventDate: '2026-08-12', title: 'General Track Evening', circuit: 'Donington Park GP', url: 'https://bike.msvtrackdays.com/calendar/bike/doningtonpark/2026/8/12/evening' },
  { eventDate: '2026-08-12', title: 'General Track Day', circuit: 'Snetterton 300', url: 'https://bike.msvtrackdays.com/calendar/bike/snetterton/2026/8/12' },
  { eventDate: '2026-08-17', title: 'Licence Course and Track Evening', circuit: 'Donington Park GP', url: 'https://bike.msvtrackdays.com/calendar/bike/doningtonpark/2026/8/17/evening' },
  { eventDate: '2026-08-17', title: 'Novice Only Trackday', circuit: 'Donington Park GP', url: 'https://bike.msvtrackdays.com/calendar/bike/doningtonpark/2026/8/17' },
  { eventDate: '2026-08-17', title: 'General Track Day', circuit: 'Snetterton 300', url: 'https://bike.msvtrackdays.com/calendar/bike/snetterton/2026/8/17' },
  { eventDate: '2026-08-17', title: 'General Track Evening', circuit: 'Snetterton 300', url: 'https://bike.msvtrackdays.com/calendar/bike/snetterton/2026/8/17/evening' },
  { eventDate: '2026-08-19', title: 'Road Bike Track Day', circuit: 'Oulton Park International', url: 'https://bike.msvtrackdays.com/calendar/bike/oultonpark/2026/8/19' },
  { eventDate: '2026-08-20', title: 'General Track Day', circuit: 'Brands Hatch GP', url: 'https://bike.msvtrackdays.com/calendar/bike/brandshatch/2026/8/20' },
  { eventDate: '2026-08-22', title: 'General Track Day', circuit: 'Cadwell Park Full Circuit', url: 'https://bike.msvtrackdays.com/calendar/bike/cadwellpark/2026/8/22' },
  { eventDate: '2026-08-24', title: 'General Track Day', circuit: 'Bedford Autodrome South West', url: 'https://bike.msvtrackdays.com/calendar/bike/bedfordautodrome/2026/8/24' },
  { eventDate: '2026-08-25', title: 'Carole Nash Track Day', circuit: 'Cadwell Park Full Circuit', url: 'https://bike.msvtrackdays.com/calendar/bike/cadwellpark/2026/8/25' },
  { eventDate: '2026-08-25', title: 'General Track Evening', circuit: 'Donington Park GP', url: 'https://bike.msvtrackdays.com/calendar/bike/doningtonpark/2026/8/25/evening' },
  { eventDate: '2026-08-25', title: 'Unsilenced Track Day', circuit: 'Donington Park GP', url: 'https://bike.msvtrackdays.com/calendar/bike/doningtonpark/2026/8/25' },
  { eventDate: '2026-08-31', title: 'General Track Day', circuit: 'Donington Park GP', url: 'https://bike.msvtrackdays.com/calendar/bike/doningtonpark/2026/8/31' },
  // September
  { eventDate: '2026-09-02', title: 'General Track Day', circuit: 'Brands Hatch Indy', url: 'https://bike.msvtrackdays.com/calendar/bike/brandshatch/2026/9/2' },
  { eventDate: '2026-09-02', title: 'General Track Evening', circuit: 'Brands Hatch Indy', url: 'https://bike.msvtrackdays.com/calendar/bike/brandshatch/2026/9/2/evening' },
  { eventDate: '2026-09-02', title: 'General Track Day', circuit: 'Oulton Park International', url: 'https://bike.msvtrackdays.com/calendar/bike/oultonpark/2026/9/2' },
  { eventDate: '2026-09-03', title: 'General Track Day', circuit: 'Cadwell Park Full Circuit', url: 'https://bike.msvtrackdays.com/calendar/bike/cadwellpark/2026/9/3' },
  { eventDate: '2026-09-03', title: 'General Track Evening', circuit: 'Cadwell Park Full Circuit', url: 'https://bike.msvtrackdays.com/calendar/bike/cadwellpark/2026/9/3/evening' },
  { eventDate: '2026-09-04', title: 'Novice Only Trackday', circuit: 'Cadwell Park Full Circuit', url: 'https://bike.msvtrackdays.com/calendar/bike/cadwellpark/2026/9/4' },
  { eventDate: '2026-09-07', title: 'General Track Day', circuit: 'Donington Park National', url: 'https://bike.msvtrackdays.com/calendar/bike/doningtonpark/2026/9/7' },
  { eventDate: '2026-09-07', title: 'General Track Evening', circuit: 'Donington Park GP', url: 'https://bike.msvtrackdays.com/calendar/bike/doningtonpark/2026/9/7/evening' },
  { eventDate: '2026-09-07', title: 'Novice Only Trackday', circuit: 'Snetterton 300', url: 'https://bike.msvtrackdays.com/calendar/bike/snetterton/2026/9/7' },
  { eventDate: '2026-09-08', title: 'Unsilenced Track Day', circuit: 'Donington Park GP', url: 'https://bike.msvtrackdays.com/calendar/bike/doningtonpark/2026/9/8' },
  { eventDate: '2026-09-08', title: 'General Track Day', circuit: 'Snetterton 300', url: 'https://bike.msvtrackdays.com/calendar/bike/snetterton/2026/9/8' },
  { eventDate: '2026-09-14', title: 'General Track Day', circuit: 'Bedford Autodrome South West', url: 'https://bike.msvtrackdays.com/calendar/bike/bedfordautodrome/2026/9/14' },
  { eventDate: '2026-09-14', title: 'General Track Day', circuit: 'Brands Hatch Indy', url: 'https://bike.msvtrackdays.com/calendar/bike/brandshatch/2026/9/14' },
  { eventDate: '2026-09-16', title: 'Novice Only Trackday with Demon Tweeks', circuit: 'Oulton Park International', url: 'https://bike.msvtrackdays.com/calendar/bike/oultonpark/2026/9/16' },
  { eventDate: '2026-09-18', title: 'General Track Day', circuit: 'Cadwell Park Full Circuit', url: 'https://bike.msvtrackdays.com/calendar/bike/cadwellpark/2026/9/18' },
  { eventDate: '2026-09-21', title: 'General Track Day', circuit: 'Donington Park GP', url: 'https://bike.msvtrackdays.com/calendar/bike/doningtonpark/2026/9/21' },
  { eventDate: '2026-09-25', title: 'Classic and Retro Bike Track Day', circuit: 'Cadwell Park Full Circuit', url: 'https://bike.msvtrackdays.com/calendar/bike/cadwellpark/2026/9/25' },
  { eventDate: '2026-09-26', title: 'General Track Day', circuit: 'Snetterton 300', url: 'https://bike.msvtrackdays.com/calendar/bike/snetterton/2026/9/26' },
  { eventDate: '2026-09-28', title: 'General Track Day', circuit: 'Brands Hatch Indy', url: 'https://bike.msvtrackdays.com/calendar/bike/brandshatch/2026/9/28' },
  { eventDate: '2026-09-29', title: 'General Track Day', circuit: 'Oulton Park International', url: 'https://bike.msvtrackdays.com/calendar/bike/oultonpark/2026/9/29' },
  { eventDate: '2026-09-30', title: 'Carole Nash Track Day', circuit: 'Donington Park National', url: 'https://bike.msvtrackdays.com/calendar/bike/doningtonpark/2026/9/30' },
];

const NOLIMITS_EVENTS: SeedEvent[] = [
  // August
  { eventDate: '2026-08-14', title: 'Track Day', circuit: 'Anglesey International', url: 'https://www.nolimitstrackdays.com/anglesey-international-august-14-2026' },
  { eventDate: '2026-08-15', title: 'Track Day', circuit: 'Donington Park', url: 'https://www.nolimitstrackdays.com/donington-park-august-15-2026' },
  { eventDate: '2026-08-15', title: 'Track Day', circuit: 'Oulton Park', url: 'https://www.nolimitstrackdays.com/oulton-park-august-15-2026' },
  { eventDate: '2026-08-16', title: 'Track Day', circuit: 'Donington Park', url: 'https://www.nolimitstrackdays.com/donington-park-august-16-2026' },
  { eventDate: '2026-08-17', title: 'Track Day', circuit: 'Cadwell Park', url: 'https://www.nolimitstrackdays.com/cadwell-park-august-17-2026' },
  { eventDate: '2026-08-17', title: 'Track Evening', circuit: 'Cadwell Park', url: 'https://www.nolimitstrackdays.com/cadwell-park-august-17-2026-evening' },
  { eventDate: '2026-08-22', title: 'Track Day', circuit: 'Mallory Park', url: 'https://www.nolimitstrackdays.com/mallory-park-august-22-2026' },
  { eventDate: '2026-08-23', title: 'Track Day', circuit: 'Anglesey International', url: 'https://www.nolimitstrackdays.com/anglesey-international-august-23-2026' },
  { eventDate: '2026-08-24', title: 'Track Day', circuit: 'Donington Park', url: 'https://www.nolimitstrackdays.com/donington-park-august-24-2026' },
  { eventDate: '2026-08-25', title: 'Track Day', circuit: 'Brands Hatch Indy', url: 'https://www.nolimitstrackdays.com/brands-hatch-indy-august-25-2026' },
  { eventDate: '2026-08-25', title: 'Track Evening', circuit: 'Brands Hatch Indy', url: 'https://www.nolimitstrackdays.com/brands-hatch-indy-august-25-2026-evening' },
  { eventDate: '2026-08-26', title: 'Track Day', circuit: 'Oulton Park', url: 'https://www.nolimitstrackdays.com/oulton-park-august-26-2026' },
  { eventDate: '2026-08-27', title: 'Track Day', circuit: 'Croft', url: 'https://www.nolimitstrackdays.com/croft-august-27-2026' },
  { eventDate: '2026-08-27', title: 'Track Day', circuit: 'Donington Park', url: 'https://www.nolimitstrackdays.com/donington-park-august-27-2026' },
  { eventDate: '2026-08-27', title: 'Track Evening', circuit: 'Donington Park', url: 'https://www.nolimitstrackdays.com/donington-park-august-27-2026-evening' },
  { eventDate: '2026-08-28', title: 'Track Day', circuit: 'Croft', url: 'https://www.nolimitstrackdays.com/croft-august-28-2026' },
  { eventDate: '2026-08-31', title: 'Track Day', circuit: 'Lydden Hill', url: 'https://www.nolimitstrackdays.com/lydden-hill-august-31-2026' },
  { eventDate: '2026-08-31', title: 'Track Day', circuit: 'Mallory Park', url: 'https://www.nolimitstrackdays.com/mallory-park-august-31-2026' },
  // September
  { eventDate: '2026-09-04', title: 'Track Day', circuit: 'Mallory Park', url: 'https://www.nolimitstrackdays.com/mallory-park-september-4-2026' },
  { eventDate: '2026-09-06', title: 'Track Day', circuit: 'Cadwell Park', url: 'https://www.nolimitstrackdays.com/cadwell-park-september-6-2026' },
  { eventDate: '2026-09-07', title: 'Track Day', circuit: 'Cadwell Park', url: 'https://www.nolimitstrackdays.com/cadwell-park-september-7-2026' },
  { eventDate: '2026-09-10', title: 'Track Day', circuit: 'Donington Park', url: 'https://www.nolimitstrackdays.com/donington-park-september-10-2026' },
  { eventDate: '2026-09-10', title: 'Track Evening', circuit: 'Donington Park', url: 'https://www.nolimitstrackdays.com/donington-park-september-10-2026-evening' },
  { eventDate: '2026-09-10', title: 'Track Day', circuit: 'Croft', url: 'https://www.nolimitstrackdays.com/croft-september-10-2026' },
  { eventDate: '2026-09-11', title: 'Track Day', circuit: 'Croft', url: 'https://www.nolimitstrackdays.com/croft-september-11-2026' },
  { eventDate: '2026-09-12', title: 'Track Day', circuit: 'Oulton Park', url: 'https://www.nolimitstrackdays.com/oulton-park-september-12-2026' },
  { eventDate: '2026-09-12', title: 'Track Day', circuit: 'Mallory Park', url: 'https://www.nolimitstrackdays.com/mallory-park-september-12-2026' },
  { eventDate: '2026-09-14', title: 'Track Day', circuit: 'Snetterton', url: 'https://www.nolimitstrackdays.com/snetterton-september-14-2026' },
  { eventDate: '2026-09-18', title: 'Track Day', circuit: 'Donington Park', url: 'https://www.nolimitstrackdays.com/donington-park-september-18-2026' },
  { eventDate: '2026-09-19', title: 'Track Day', circuit: 'Oulton Park', url: 'https://www.nolimitstrackdays.com/oulton-park-september-19-2026' },
  { eventDate: '2026-09-21', title: 'Track Day', circuit: 'Cadwell Park', url: 'https://www.nolimitstrackdays.com/cadwell-park-september-21-2026' },
  { eventDate: '2026-09-25', title: 'Track Day', circuit: 'Mallory Park', url: 'https://www.nolimitstrackdays.com/mallory-park-september-25-2026' },
  { eventDate: '2026-09-26', title: 'Track Day', circuit: 'Anglesey International', url: 'https://www.nolimitstrackdays.com/anglesey-international-september-26-2026' },
  { eventDate: '2026-09-26', title: 'Track Day', circuit: 'Lydden Hill', url: 'https://www.nolimitstrackdays.com/lydden-hill-september-26-2026' },
  // October
  { eventDate: '2026-10-01', title: 'Track Day', circuit: 'Oulton Park', url: 'https://www.nolimitstrackdays.com/oulton-park-october-1-2026' },
  { eventDate: '2026-10-01', title: 'Track Day', circuit: 'Brands Hatch Indy', url: 'https://www.nolimitstrackdays.com/brands-hatch-indy-october-1-2026' },
  { eventDate: '2026-10-02', title: 'Track Day', circuit: 'Mallory Park', url: 'https://www.nolimitstrackdays.com/mallory-park-october-2-2026' },
  { eventDate: '2026-10-03', title: 'Track Day', circuit: 'Cadwell Park', url: 'https://www.nolimitstrackdays.com/cadwell-park-october-3-2026' },
  { eventDate: '2026-10-03', title: 'Track Day', circuit: 'Snetterton', url: 'https://www.nolimitstrackdays.com/snetterton-october-3-2026' },
  { eventDate: '2026-10-04', title: 'Track Day', circuit: 'Snetterton', url: 'https://www.nolimitstrackdays.com/snetterton-october-4-2026' },
  { eventDate: '2026-10-04', title: 'Track Day', circuit: 'Cadwell Park', url: 'https://www.nolimitstrackdays.com/cadwell-park-october-4-2026' },
  { eventDate: '2026-10-05', title: 'Track Day', circuit: 'Cadwell Park', url: 'https://www.nolimitstrackdays.com/cadwell-park-october-5-2026' },
  { eventDate: '2026-10-08', title: 'Track Day', circuit: 'Donington Park', url: 'https://www.nolimitstrackdays.com/donington-park-october-8-2026' },
  { eventDate: '2026-10-09', title: 'Track Day', circuit: 'Donington Park', url: 'https://www.nolimitstrackdays.com/donington-park-october-9-2026' },
  { eventDate: '2026-10-17', title: 'Track Day', circuit: 'Mallory Park', url: 'https://www.nolimitstrackdays.com/mallory-park-october-17-2026' },
  { eventDate: '2026-10-25', title: 'Track Day', circuit: 'Cadwell Park', url: 'https://www.nolimitstrackdays.com/cadwell-park-october-25-2026' },
  { eventDate: '2026-10-27', title: 'Track Day', circuit: 'Brands Hatch Indy', url: 'https://www.nolimitstrackdays.com/brands-hatch-indy-october-27-2026' },
  { eventDate: '2026-10-29', title: 'Track Day', circuit: 'Donington Park', url: 'https://www.nolimitstrackdays.com/donington-park-october-29-2026' },
  { eventDate: '2026-10-30', title: 'Track Day', circuit: 'Oulton Park', url: 'https://www.nolimitstrackdays.com/oulton-park-october-30-2026' },
  { eventDate: '2026-10-31', title: 'Track Day', circuit: 'Donington Park', url: 'https://www.nolimitstrackdays.com/donington-park-october-31-2026' },
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
  // `url` is destructured out rather than spread through: it is the seed's own
  // field name, and the column is `sourceUrl`.
  const rows = [
    ...MSV_EVENTS.map(({ url, ...event }) => ({
      ...event,
      circuit: normaliseCircuit(event.circuit),
      provider: 'msv' as const,
      sourceUrl: url,
    })),
    ...NOLIMITS_EVENTS.map(({ url, ...event }) => ({
      ...event,
      circuit: normaliseCircuit(event.circuit),
      provider: 'nolimits' as const,
      sourceUrl: url,
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
