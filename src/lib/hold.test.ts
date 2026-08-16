import { describe, expect, it } from 'vitest';

import {
  HOLD_DURATION_MS,
  holdExpiresAt,
  holdRemainingMs,
  isBuyable,
  isHeldByAnother,
  isHoldExpired,
  isHoldLive,
} from './hold';

const now = new Date('2026-08-16T12:00:00Z');
const ms = (offset: number) => new Date(now.getTime() + offset);

describe('holdExpiresAt', () => {
  it('runs for ten minutes', () => {
    expect(HOLD_DURATION_MS).toBe(600_000);
    expect(holdExpiresAt(now)).toEqual(new Date('2026-08-16T12:10:00Z'));
  });

  it('does not mutate the date it is given', () => {
    const from = new Date(now);
    holdExpiresAt(from);
    expect(from).toEqual(now);
  });
});

describe('isHoldLive', () => {
  it('is live while there is time left', () => {
    expect(isHoldLive(ms(1), now)).toBe(true);
  });

  it('is over once the time has passed', () => {
    expect(isHoldLive(ms(-1), now)).toBe(false);
  });

  it('treats a hold expiring exactly now as over', () => {
    // The tie has to break the same way here and in SQL, where the mirror is
    // `hold_expires_at <= now()`. Both sides say: expired.
    expect(isHoldLive(new Date(now), now)).toBe(false);
  });

  it('treats no hold at all as not live', () => {
    expect(isHoldLive(null, now)).toBe(false);
  });
});

describe('isHoldExpired', () => {
  it('is true once the time has passed', () => {
    expect(isHoldExpired(ms(-1), now)).toBe(true);
  });

  it('is true at exactly the expiry instant', () => {
    // Mirrors SQL's `hold_expires_at <= now()`.
    expect(isHoldExpired(new Date(now), now)).toBe(true);
  });

  it('is false while the hold is running', () => {
    expect(isHoldExpired(ms(1), now)).toBe(false);
  });

  it('is not the negation of isHoldLive when there is no hold', () => {
    // SQL's three-valued logic, kept: `NULL <= now()` is NULL, which a WHERE
    // clause does not treat as true. Null is neither live nor expired, and
    // collapsing the two would let the read paths and the claim disagree.
    expect(isHoldLive(null, now)).toBe(false);
    expect(isHoldExpired(null, now)).toBe(false);
  });

  it('is the exact negation of isHoldLive whenever a hold exists', () => {
    for (const offset of [-600_000, -1, 0, 1, 600_000]) {
      expect(isHoldExpired(ms(offset), now)).toBe(!isHoldLive(ms(offset), now));
    }
  });
});

describe('holdRemainingMs', () => {
  it('counts down', () => {
    expect(holdRemainingMs(ms(90_000), now)).toBe(90_000);
  });

  it('floors at zero rather than going negative', () => {
    expect(holdRemainingMs(ms(-90_000), now)).toBe(0);
  });

  it('is zero when there is no hold', () => {
    expect(holdRemainingMs(null, now)).toBe(0);
  });
});

describe('isBuyable', () => {
  it('lets an active listing be claimed', () => {
    expect(isBuyable({ status: 'active', holdExpiresAt: null }, now)).toBe(true);
  });

  it('refuses a listing somebody is currently holding', () => {
    expect(isBuyable({ status: 'pending', holdExpiresAt: ms(60_000) }, now)).toBe(
      false
    );
  });

  it('releases a lapsed hold without anything having swept it', () => {
    // The whole of lazy release: the row still says 'pending' and nothing has
    // run, but the listing is available again.
    expect(isBuyable({ status: 'pending', holdExpiresAt: ms(-1) }, now)).toBe(
      true
    );
  });

  it('refuses every status that is not active or pending', () => {
    for (const status of ['paid', 'transferred', 'withdrawn']) {
      expect(isBuyable({ status, holdExpiresAt: null }, now)).toBe(false);
      // Even with a lapsed hold left on the row: a sold listing is sold.
      expect(isBuyable({ status, holdExpiresAt: ms(-1) }, now)).toBe(false);
    }
  });

  it('refuses a pending listing carrying no hold at all', () => {
    // Should not occur — a claim always writes both columns together — but
    // guessing "available" from a missing expiry is how a place gets sold
    // twice, so the safe reading is that somebody is mid-purchase.
    expect(isBuyable({ status: 'pending', holdExpiresAt: null }, now)).toBe(
      false
    );
  });
});

describe('isHeldByAnother', () => {
  it('is true only while a pending listing has a live hold', () => {
    expect(
      isHeldByAnother({ status: 'pending', holdExpiresAt: ms(60_000) }, now)
    ).toBe(true);
  });

  it('is false once the hold lapses, because the listing is free again', () => {
    expect(
      isHeldByAnother({ status: 'pending', holdExpiresAt: ms(-1) }, now)
    ).toBe(false);
  });

  it('claims a pending listing with no expiry, rather than leaving it stateless', () => {
    // The row should not exist, but between them the two functions have to
    // account for every pending listing — otherwise a page renders neither
    // "buy" nor "being bought" and simply shows nothing.
    const listing = { status: 'pending', holdExpiresAt: null };
    expect(isBuyable(listing, now)).toBe(false);
    expect(isHeldByAnother(listing, now)).toBe(true);
  });

  it('accounts for every pending listing between them', () => {
    for (const holdExpiresAt of [ms(-1), new Date(now), ms(1), null]) {
      const listing = { status: 'pending', holdExpiresAt };
      expect(isBuyable(listing, now) || isHeldByAnother(listing, now)).toBe(
        true
      );
    }
  });

  it('is never true at the same time as isBuyable', () => {
    const listings = [
      { status: 'active', holdExpiresAt: null },
      { status: 'pending', holdExpiresAt: ms(60_000) },
      { status: 'pending', holdExpiresAt: ms(-1) },
      { status: 'pending', holdExpiresAt: new Date(now) },
      { status: 'paid', holdExpiresAt: null },
    ];

    for (const listing of listings) {
      expect(isBuyable(listing, now) && isHeldByAnother(listing, now)).toBe(
        false
      );
    }
  });
});
