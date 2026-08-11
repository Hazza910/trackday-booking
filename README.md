# Trackday Resale

A peer-to-peer resale marketplace for UK motorcycle track days.

Sellers list a track day place they can no longer use, buyers pick up a date
that is often already sold out, and the place moves across using the
provider's own name-change process. Listings attach to a curated directory of
real provider events rather than free-text dates, so a buyer knows exactly
which circuit, date and rider group they are buying into.

## Why this exists

Track day providers generally cannot refund a booking within 14 days of the
event — but almost all of them will change the name on a booking for free.

That gap is the whole product. A rider who breaks a bike, gets injured, or
simply has work come up is otherwise left choosing between losing the full
cost of the day or arranging a private sale through a forum thread or Facebook
group, with no escrow and no protection on either side.

Trackday Resale turns that informal scramble into a proper transaction:
listings tied to verified events, payment held through Stripe, and a defined
hand-off where the seller confirms the name change once the buyer has paid.
The provider keeps a full grid, the seller recovers most of their money, and
the buyer gets a place on a sold-out day.

## Stack

- **Next.js** (App Router) with TypeScript in strict mode
- **Drizzle ORM** over **Neon** serverless Postgres
- **Clerk** for authentication
- **Stripe** for payments
- **Tailwind CSS** for styling
- **Vitest** and **Playwright** for testing

## Getting started

```bash
pnpm install
pnpm dev
```

The app runs at http://localhost:3000.

Environment variables live in `.env.local` and are validated by `src/env.ts` —
`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
and `CLERK_SECRET_KEY`.

### Database

```bash
pnpm db:generate   # generate a migration from src/db/schema.ts
pnpm db:migrate    # apply pending migrations
pnpm db:studio     # browse the data
```

Migrations run over the direct (non-pooled) Neon connection; the app itself
uses the pooled one.

## Roadmap

- **Automated event ingestion** — a daily cron job that fetches provider
  schedules and uses the Claude API to extract structured events (circuit,
  date, group levels, source URL) into the directory, replacing manual entry.
- **Stripe Connect seller payouts** — pay sellers directly once a transfer is
  confirmed, with funds held until the name change is done.
- **Provider partnerships** — work with organisers such as MSV and No Limits
  to formalise the transfer step, ideally reaching direct API confirmation of
  a name change instead of a manual seller declaration.
