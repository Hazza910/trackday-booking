import { clerkClient } from '@clerk/nextjs/server';
import { and, eq, isNull } from 'drizzle-orm';

import { db } from './index';
import { listings } from './schema';

/**
 * One-off backfill for listings created before the seller name was
 * denormalised (migration 0006).
 *
 * Those rows have null name columns, and nothing would ever fill them: the
 * `user.updated` webhook only fires when a seller edits their profile, so a
 * listing whose owner never touches their account again would read
 * "A seller" permanently.
 *
 * Safe to re-run. Only rows with no name and no deletion tombstone are
 * touched, so it cannot overwrite a live name or resurrect a deleted one.
 *
 *   pnpm db:backfill-seller-names
 */

/** Clerk's documented cap: `userId` accepts up to 100 ids per request. */
const CLERK_USER_ID_BATCH = 100;

async function backfill() {
  const rows = await db
    .select({ sellerId: listings.sellerId })
    .from(listings)
    .where(isNull(listings.sellerDeletedAt));

  const sellerIds = [...new Set(rows.map((row) => row.sellerId))];
  if (sellerIds.length === 0) {
    console.log('no listings to backfill');
    return;
  }

  const client = await clerkClient();
  let updated = 0;

  for (let index = 0; index < sellerIds.length; index += CLERK_USER_ID_BATCH) {
    const batch = sellerIds.slice(index, index + CLERK_USER_ID_BATCH);
    // `limit` defaults to 10, so a full batch without it silently returns ten.
    const { data } = await client.users.getUserList({
      userId: batch,
      limit: CLERK_USER_ID_BATCH,
    });

    for (const user of data) {
      const username = user.username?.trim() || null;
      const firstName = user.firstName?.trim() || null;
      if (username === null && firstName === null) {
        continue;
      }

      const result = await db
        .update(listings)
        .set({ sellerUsername: username, sellerFirstName: firstName })
        .where(
          and(
            // Scoped to this seller. Without it every listing in the table
            // would be stamped with whichever name came back last.
            eq(listings.sellerId, user.id),
            isNull(listings.sellerDeletedAt),
            // Only rows that never got a name. A live name is authoritative —
            // the webhook keeps it current, and this must not roll it back.
            isNull(listings.sellerUsername),
            isNull(listings.sellerFirstName)
          )
        )
        .returning({ id: listings.id });

      updated += result.length;
    }
  }

  console.log(`backfilled ${updated} listing(s) across ${sellerIds.length} seller(s)`);
}

backfill()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('backfill failed:', error);
    process.exit(1);
  });
