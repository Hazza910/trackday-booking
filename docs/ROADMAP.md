# Roadmap

What is built, what is being built, and what is deliberately not being built
yet. Phases are an ordering, not a schedule — the point is that nothing from a
later phase gets pulled forward without a reason recorded here.

## Shipped

- Curated event directory for MSV and No Limits, seeded and upserted on a
  natural key so a re-seed never duplicates a day.
- Per-event deep links to the provider's own page.
- Seller listing form, with the contact-detail filter on free-text notes.
- Buyer-facing Paddock Board: listings by month and day, with a calendar.
- Seller names denormalised onto listings and kept current by Clerk webhooks,
  including a deletion tombstone so a retried `user.updated` cannot resurrect
  the name of a deleted account.

## In progress — the buy flow

Phase 1 is schema, plumbing and the checkout skeleton:

1. Purchase schema and the pure domain logic (hold, fee, deadlines, states).
2. Lazy hold release across the read paths.
3. Claim and consent — the conditional-claim guard that closes the double-sell
   race lands here.
4. Embedded Stripe Checkout and a minimal order page.
5. Stripe webhook: payment confirmation, idempotent.
6. Seller notification on sale.

Deliberately out of scope for now: seller payouts, refunds, and the transfer
confirmation step.

## Phase 2 — usability and near-term revenue

- **Buyer alerts / "notify me"** on a circuit and date that is not yet listed.
  Highest priority in this phase. It turns a passive noticeboard into something
  that reaches out, and a seller listing into an existing queue of buyers sells
  faster.

- **Per-provider click-tracking.** Count click-throughs to each provider, per
  track day. Scheduled deliberately earlier than its payoff: the number is the
  evidence for the provider partnership below, and traffic you never recorded
  cannot be backfilled. Every week without the counter is evidence permanently
  lost.

  **These two are adjacent and should share one demand-signal store.** A
  "notify me" registration on a circuit and date is demand evidence of exactly
  the same kind as a click-through — arguably better evidence, because it is a
  named rider asking for a day that does not exist yet. Building them as two
  unrelated counters means holding the same argument twice with two sets of
  numbers that will not reconcile. Whichever is built first should record into
  a shape the other can write to.

- **Featured listings** — a seller pays to pin a listing near the event date.
  Optional, pure margin.

  **Gated on the double-sell guard being in place** (buy-flow step 3 above).
  Taking money to promote a listing that two buyers can still both claim sells
  a promise the system cannot keep, and the refund lands on the paid feature
  rather than on the free one. Cheap to hold back, expensive to unpick.

- **Provider partnership** — sell providers' brand-new days for a cut, beside
  the resale listings. Gated on having traffic and click evidence first.

- **PWA config** so riders can install to the home screen. Same codebase, no
  app stores, no 30% platform cut. Native apps only if real demand appears.

## Phase 3 — the big engineering

- **Automated event ingestion.** A daily cron that fetches each provider's
  calendar and extracts structured events via the Claude API, replacing manual
  entry. Becomes essential for race weekends, where the alternative is
  hand-maintaining 30+ per-provider class lists.

- **Agent-run settlement.** An agent watches sale state changes, chases stalled
  or quiet transfers past their deadline, handles payouts, and escalates only
  genuine disputes. Event triggers for the instant work plus an hourly alarm
  for the waiting work — no always-on server.

- **Stripe Connect payouts**, replacing v1's manual escrow.

## Parked

Transponder hire, garage space, tyre-warmer rental, trackside ad slots. Same
audience and little new build, but not until the core is proven.

## Principles that outlive any one phase

- **Sale states are designed to be handed to an agent.** Every state explicit,
  every transition timestamped, nothing inferred from a derived guess. The
  Phase 3 settlement agent has to be able to read the state machine and judge
  "is this stalled?" without a human explaining it. Retrofitting states onto a
  live marketplace with money in flight is far more expensive than shaping them
  up front.

- **An agent proposes; a human approves.** The same shape as the PR rule —
  Claude opens the PR, a human merges it. The settlement agent proposes
  outbound messages and actions for approval; nothing goes out autonomously
  until its judgment has been observed on real traffic. Design the approval
  step into the data model from the start: a proposed-action queue, not a
  fire-and-forget send.

- **One notification module, a ladder of channels.** Transactional email first,
  WhatsApp next (UK riders live on it; plan for Meta business verification,
  pre-approved templates and per-conversation cost), SMS as the fallback for
  people who will not use WhatsApp. All of them behind one channel abstraction
  from the first send, so a new channel slots in beside email without a
  rewrite.

- **Deterministic templates in transactional sends. Never generated copy.**
  Every variable filled from the database. A hallucinated deadline inside a
  payment flow is a self-inflicted dispute: templates make the failure mode
  "wrong data in the database", which is findable, instead of "the model made
  something up", which is not.

- **Tightening a write-time rule includes a backfill.** When the contact-detail
  keyword list is widened, the review queue re-scans listings already stored.
  Filtering only at write time permanently exempts everything created under the
  narrower rule — including the listings that prompted the change.
