# Orphaned payments

A purchase is `orphaned` when Stripe confirms payment for a listing that had
already moved on — the buyer paid for something they cannot be given. Stripe
will not let a Checkout session live for less than 30 minutes and our hold is
10, so this can always happen; the state exists because it cannot be designed
away. Every orphan is owed a refund, and a refund is a human's decision.

Until the notifications module emails these out, the webhook's
`PAYMENT NEEDS A REFUND` log line is the only alert. **This query is the
reliable record** — run it against the production branch:

```sql
SELECT p.id                    AS purchase_id,
       p.stripe_session_id,
       p.amount_paid_in_pence,
       p.total_in_pence,
       p.orphaned_at,
       p.buyer_id,
       p.buyer_details,
       l.id                    AS listing_id,
       e.provider,
       e.circuit,
       e.event_date
  FROM purchases p
  JOIN listings l ON l.id = p.listing_id
  JOIN events   e ON e.id = l.event_id
 WHERE p.state = 'orphaned'
 ORDER BY p.orphaned_at;
```

Look the session up in the Stripe Dashboard by `stripe_session_id` to refund it.
`orphaned` is terminal for now, so a refunded row stays `orphaned`: keep track of
what has been refunded in Stripe until refunds get a state of their own.

## What the query cannot see

A payment for a session that **no purchase row carries** — logged as
`PAYMENT NEEDS A REFUND — no purchase carries this session`. With nothing in the
database, the log line and the Stripe Dashboard are the only places it shows.
Before treating one as a refund, rule out the two harmless causes:

- **Another environment on the same Stripe account.** Every endpoint, and
  every `stripe listen`, receives every event for the account and mode. A test
  payment made against local dev is also delivered to the deployed endpoint,
  which has no row for it, and the reverse. While dev and production share the
  test-mode account, expect these whenever both are taking payments.
- **`stripe trigger checkout.session.completed`.** The CLI fixture pays a
  session that no purchase ever created.

Check the session's `metadata.purchaseId` (logged with the alert) against the
environment it came from. If neither cause applies, it is a real refund, and a
bug too: the checkout action stores a session id before its client secret
reaches a browser, and a losing tab's session is never shown.

**Before real traffic**, give each environment its own Stripe sandbox, or put
an environment marker in the session metadata and ignore other environments'
sessions, so this alert only ever means a refund.
