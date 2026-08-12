import { clerkClient } from '@clerk/nextjs/server';

import {
  CLERK_USER_ID_BATCH,
  SELLER_FALLBACK_NAME,
  chunkUserIds,
  sellerDisplayName,
} from './seller-names';

/**
 * Resolves Clerk user ids to public display names.
 *
 * Server-only — `clerkClient()` needs the Backend API key.
 */

/**
 * Names every seller on a page in `ceil(distinct sellers / 100)` calls, never
 * one per listing.
 *
 * Failure is swallowed on purpose. Someone looking for a track day should
 * still see the track days when Clerk is unreachable, so a rejected batch
 * degrades to the fallback name rather than failing the whole render.
 */
export async function resolveSellerNames(
  sellerIds: readonly string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const batches = chunkUserIds(sellerIds);
  if (batches.length === 0) {
    return names;
  }

  const client = await clerkClient();

  // Sequential rather than Promise.all: each getUserList is two Backend API
  // requests (the list plus a companion count), against a quota shared with
  // every other server-side Clerk call. The SDK parses `Retry-After` and
  // surfaces `retryAfter` on its error, so 429s are a real possibility rather
  // than a theoretical one. No backoff is implemented, and the pages that call
  // this cannot be cached at the route level, so the fan-out is bounded only
  // by the batch size — see the note in src/app/listings/page.tsx.
  for (const userId of batches) {
    try {
      const { data } = await client.users.getUserList({
        userId,
        // Required. `limit` defaults to 10, so without it a full batch would
        // resolve the first ten sellers and quietly fall back on the other 90.
        limit: CLERK_USER_ID_BATCH,
      });

      for (const user of data) {
        names.set(user.id, sellerDisplayName(user));
      }
    } catch (error: unknown) {
      console.error('resolveSellerNames: batch failed', error);
    }
  }

  return names;
}

/**
 * One seller, one request. Uses `getUser` rather than `getUserList`, which
 * would fire a second request for a count we do not need.
 */
export async function resolveSellerName(sellerId: string): Promise<string> {
  try {
    const client = await clerkClient();
    return sellerDisplayName(await client.users.getUser(sellerId));
  } catch (error: unknown) {
    console.error('resolveSellerName: lookup failed', error);
    return SELLER_FALLBACK_NAME;
  }
}
