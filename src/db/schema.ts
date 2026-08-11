import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/** Lifecycle of a booking. Enforced by Postgres, not just by application code. */
export const bookingStatus = pgEnum('booking_status', [
  'pending',
  'confirmed',
  'cancelled',
]);

/** A bookable offering, e.g. "Novice Track Day". */
export const services = pgTable('services', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  durationMinutes: integer('duration_minutes').notNull(),
  /** Money is stored as integer pence, never a float (see CLAUDE.md). */
  priceInPence: integer('price_in_pence').notNull(),
  isActive: boolean('is_active').notNull().default(true),
});

/** A specific point in time at which a service can be booked. */
export const slots = pgTable(
  'slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    /** timestamptz — stored UTC (see CLAUDE.md). */
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    capacity: integer('capacity').notNull().default(1),
  },
  (table) => [index('slots_starts_at_idx').on(table.startsAt)]
);

/** A user's claim on a slot, from initial hold through to paid. */
export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  slotId: uuid('slot_id')
    .notNull()
    .references(() => slots.id, { onDelete: 'restrict' }),
  /** Clerk user ID (e.g. `user_2abc...`), not a local FK. */
  userId: text('user_id').notNull(),
  status: bookingStatus('status').notNull(),
  /** When an unpaid hold lapses; null once the booking is settled. */
  holdExpiresAt: timestamp('hold_expires_at', { withTimezone: true }),
  stripeSessionId: text('stripe_session_id').unique(),
  amountPaidInPence: integer('amount_paid_in_pence'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
