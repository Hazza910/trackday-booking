import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { GROUP_LEVELS } from '../lib/group-levels';

/** Track day organisers whose events we mirror into the directory. */
export const providerEnum = pgEnum('provider', ['msv', 'nolimits']);

/**
 * Rider group a track day place is booked into. Built from the shared tuple
 * so the enum and the form offer exactly the same values — the listing form
 * cannot import this file, since that would pull Drizzle into the browser.
 */
export const groupLevelEnum = pgEnum('group_level', GROUP_LEVELS);

/**
 * Lifecycle of a listing:
 * active → pending (buyer holding) → paid → transferred, or withdrawn by the
 * seller at any point before payment.
 */
export const listingStatusEnum = pgEnum('listing_status', [
  'active',
  'pending',
  'paid',
  'transferred',
  'withdrawn',
]);

/** Curated directory of provider track days that listings attach to. */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: providerEnum('provider').notNull(),
    /** Provider's name for the event, e.g. "General Track Day". */
    title: text('title').notNull(),
    circuit: text('circuit').notNull(),
    /** Calendar date of the track day — a day, not an instant. */
    eventDate: date('event_date').notNull(),
    sourceUrl: text('source_url').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /**
     * Natural key of a provider event, and the conflict target the seed
     * upserts on. A provider can run several events at one circuit on one day
     * (a day and an evening session), so the title is part of the key.
     */
    unique('events_provider_circuit_event_date_title_unique').on(
      table.provider,
      table.circuit,
      table.eventDate,
      table.title
    ),
  ]
);

/** A seller's place at an event, offered for resale. */
export const listings = pgTable(
  'listings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    /** Clerk user ID of the seller. */
    sellerId: text('seller_id').notNull(),
    groupLevel: groupLevelEnum('group_level').notNull(),
    /** Money is stored as integer pence, never a float (see CLAUDE.md). */
    askingPriceInPence: integer('asking_price_in_pence').notNull(),
    /** What the seller originally paid, shown as a reference price. */
    originalPriceInPence: integer('original_price_in_pence').notNull(),
    /**
     * The seller's reference with the provider, used to action the name
     * change. Shown to nobody but the seller until a sale completes.
     */
    bookingReference: text('booking_reference').notNull(),
    notes: text('notes'),
    status: listingStatusEnum('status').notNull().default('active'),
    /** When a buyer's hold lapses; null unless a hold is in flight. */
    holdExpiresAt: timestamp('hold_expires_at', { withTimezone: true }),
    /** Clerk user ID of the buyer; null until a hold is taken. */
    buyerId: text('buyer_id'),
    stripeSessionId: text('stripe_session_id').unique(),
    amountPaidInPence: integer('amount_paid_in_pence'),
    /** Set once the seller confirms the provider name change is done. */
    transferredAt: timestamp('transferred_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('listings_status_idx').on(table.status),
    index('listings_event_id_idx').on(table.eventId),
  ]
);
