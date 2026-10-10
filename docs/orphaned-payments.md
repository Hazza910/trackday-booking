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
The checkout action is written so this should not happen (a session id is
stored before its client secret reaches a browser, and a losing tab's session
is never shown), so one appearing is a bug as well as a refund.
