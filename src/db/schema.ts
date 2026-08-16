import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { GROUP_LEVELS } from '../lib/group-levels';
import { PURCHASE_STATES } from '../lib/purchase-state';

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
    /**
     * The seller's public name fields, copied from Clerk when the listing is
     * created and kept current by the `user.updated` webhook.
     *
     * Denormalised so rendering a listing never calls Clerk: a public page
     * that hits the Backend API lets anonymous traffic burn a quota shared
     * with signed-in users. Stored raw rather than pre-formatted so the
     * display rule can change without a backfill — see `sellerDisplayName`
     * in src/lib/seller-names.ts.
     *
     * Nullable throughout: a seller may have neither set, and both are blanked
     * when the account is deleted.
     */
    sellerUsername: text('seller_username'),
    sellerFirstName: text('seller_first_name'),
    /**
     * Set when the seller's Clerk account is deleted.
     *
     * A tombstone, not a status. Webhook deliveries are neither ordered nor
     * once-only: a `user.updated` that failed earlier can be retried hours
     * later and land *after* the `user.deleted` that erased the name, writing
     * it straight back — and `user.deleted` never fires again to undo that.
     * The update path refuses to write to a row carrying this.
     *
     * Set on mid-sale rows too. It records the state of the account, not of
     * the sale, so it can guard them without transitioning them.
     */
    sellerDeletedAt: timestamp('seller_deleted_at', { withTimezone: true }),
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
    /**
     * The lock on the listing, together with `holdExpiresAt`.
     *
     * These two columns are what a buyer's claim conditionally updates, and
     * Postgres' row lock on this single row is the whole of the double-sell
     * protection. The claim's predicate must therefore stay answerable from
     * this row alone — never widen it into something that needs a join.
     */
    status: listingStatusEnum('status').notNull().default('active'),
    /** When a buyer's hold lapses; null unless a hold is in flight. */
    holdExpiresAt: timestamp('hold_expires_at', { withTimezone: true }),
    /**
     * The purchase attempt currently holding this listing.
     *
     * Deliberately without a foreign key. It is set in the same statement that
     * inserts the row it points at — a data-modifying CTE, since the Neon HTTP
     * driver has no transactions — and referential integrity checked part-way
     * through that statement is a question with a subtle answer. This is a
     * denormalised pointer for the payment path to check against, not a
     * relationship: `purchases.listing_id` is the real edge, and it does carry
     * a foreign key.
     *
     * Null when nothing holds the listing. Stale values are harmless — every
     * reader pairs it with `status` and `holdExpiresAt`.
     */
    currentPurchaseId: uuid('current_purchase_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('listings_status_idx').on(table.status),
    index('listings_event_id_idx').on(table.eventId),
  ]
);

/**
 * State of one attempt to buy a listing. The partition and the legal
 * transitions live in src/lib/purchase-state.ts, which is where the enum's
 * values come from — so adding a state forces a decision about what it means
 * rather than silently widening the column.
 */
export const purchaseStateEnum = pgEnum('purchase_state', PURCHASE_STATES);

/**
 * One buyer's attempt to buy one listing.
 *
 * Separate from `listings` because a listing collects several of these over its
 * life — lapsed holds, buyers who lose the race, abandoned checkouts — and each
 * carries its own consent record, buyer details and Stripe session. Held on the
 * listing itself, every one of those would overwrite the last, and the unique
 * `stripe_session_id` would leave a second attempt nowhere to go.
 *
 * Every transition stamps its own timestamp. That is not bookkeeping for its
 * own sake: the settlement agent has to be able to judge "is this stalled?"
 * from the row, without a human explaining the schema to it.
 */
export const purchases = pgTable(
  'purchases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'restrict' }),
    /** Clerk user ID of the buyer. Buying requires an account. */
    buyerId: text('buyer_id').notNull(),
    state: purchaseStateEnum('state').notNull().default('held'),

    /**
     * The price as it stood when the hold was taken, plus the fee worked out
     * from it. Snapshotted rather than read back through the listing: this is
     * the number the buyer was shown, consented to and was charged, and it has
     * to stay legible after the listing changes or goes away.
     *
     * The fee and total are computed in TypeScript from a price read a moment
     * before the claim, while the asking price comes from the row the claim
     * actually updated — so the claim's predicate carries an
     * `asking_price_in_pence = $n` guard. A price that moved underneath the
     * buyer fails the claim instead of writing a row whose fee does not match
     * its price. Nothing can edit a price today; the guard is there so that
     * staying true is not contingent on that remaining so.
     */
    askingPriceInPence: integer('asking_price_in_pence').notNull(),
    buyerFeeInPence: integer('buyer_fee_in_pence').notNull(),
    totalInPence: integer('total_in_pence').notNull(),
    /** What Stripe says actually arrived; null until payment confirms. */
    amountPaidInPence: integer('amount_paid_in_pence'),

    stripeSessionId: text('stripe_session_id').unique(),

    /**
     * Buyer details for the provider's name change.
     *
     * `jsonb` and untyped on purpose: the exact fields each provider needs are
     * still being confirmed, and a column per field would mean a migration per
     * answer. Drizzle hands this back as `unknown`, so every read has to go
     * through Zod — which is the rule anyway, and here the compiler enforces
     * it. `buyerDetailsVersion` records which field set was collected, so
     * rows written under an earlier shape stay readable.
     */
    buyerDetails: jsonb('buyer_details'),
    buyerDetailsVersion: text('buyer_details_version'),

    /**
     * The consent record.
     *
     * `NOT NULL` because the row does not exist until the buyer has consented.
     * The boxes are ticked on the pre-payment page and the claim fires on its
     * submit, so there is no window in which a purchase exists without a
     * recorded acceptance — the database enforces it rather than the payment
     * path having to remember to. The hold's ten minutes therefore cover the
     * payment itself, not the time spent filling in the form.
     *
     * `riskAcceptedAt` stays nullable: the warning is only shown inside 48
     * hours of the event. `riskWarningRequired` is stored rather than
     * recomputed so that a null there is never ambiguous — it separates "was
     * not asked, because the event was far enough out" from "was asked and did
     * not accept". Fixed at claim time, from the event date.
     */
    finalSaleAcceptedAt: timestamp('final_sale_accepted_at', {
      withTimezone: true,
    }).notNull(),
    riskWarningRequired: boolean('risk_warning_required').notNull(),
    riskAcceptedAt: timestamp('risk_accepted_at', { withTimezone: true }),
    /** Which wording the buyer was shown, for the record in a dispute. */
    consentVersion: text('consent_version').notNull(),

    /** When this attempt's claim on the listing lapses. */
    holdExpiresAt: timestamp('hold_expires_at', { withTimezone: true }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    expiredAt: timestamp('expired_at', { withTimezone: true }),
    orphanedAt: timestamp('orphaned_at', { withTimezone: true }),
    /**
     * When the seller must have completed the name change by. Stamped at
     * payment rather than derived on read, so the deadline quoted in the email
     * and the one the settlement agent judges against are the same value.
     */
    transferDeadlineAt: timestamp('transfer_deadline_at', {
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('purchases_listing_id_idx').on(table.listingId),
    index('purchases_buyer_id_idx').on(table.buyerId),
    index('purchases_state_idx').on(table.state),
  ]
);
