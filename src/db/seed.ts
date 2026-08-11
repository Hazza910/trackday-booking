import { db } from './index';
import { events } from './schema';

/**
 * Seeds the curated event directory from published provider schedules.
 *
 * Idempotency: delete-and-reinsert. The directory is a mirror of the
 * providers' own listings, so the stored rows should always match the source
 * exactly — including removals. Row ids are not stable across runs.
 *
 * NOTE: `listings.event_id` is `ON DELETE restrict`, so this wipe only works
 * while no listing references an event. Once sellers list against these rows,
 * this script must become an upsert keyed on
 * (provider, circuit, event_date, title).
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

  await db.delete(events);
  await db.insert(events).values(rows);

  console.log(
    `events: ${rows.length} inserted ` +
      `(msv ${MSV_EVENTS.length}, nolimits ${NOLIMITS_EVENTS.length})`
  );
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
