import { z } from 'zod';

/**
 * Validation for the Clerk webhook payloads we act on.
 *
 * Clerk sends **snake_case** on the wire (`first_name`), which is a different
 * shape from the SDK's camelCase `User` class — mixing them up yields silent
 * `undefined`s rather than a type error, so the boundary is parsed explicitly.
 */

/** Blank is not a name. Matches how `sellerDisplayName` reads these fields. */
const nameField = z
  .string()
  .nullish()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  });

export const userUpdatedPayloadSchema = z.object({
  id: z.string().min(1),
  username: nameField,
  first_name: nameField,
});

/**
 * `id` is optional in Clerk's `DeletedObjectJSON` — unlike the updated payload,
 * it does not extend `ClerkResourceJSON`. It is required here because the
 * alternative is a `WHERE seller_id = undefined`, which is either a silent
 * no-op or a query against every row depending on how it is built. A payload
 * without an id is rejected rather than guessed at.
 */
export const userDeletedPayloadSchema = z.object({
  id: z.string().min(1),
});

export type SellerNameColumns = {
  readonly sellerUsername: string | null;
  readonly sellerFirstName: string | null;
};

/** Maps a validated `user.updated` payload onto the denormalised columns. */
export function sellerColumnsFromPayload(payload: {
  username: string | null;
  first_name: string | null;
}): SellerNameColumns {
  return {
    sellerUsername: payload.username,
    sellerFirstName: payload.first_name,
  };
}

/** What a deleted account leaves behind: nothing. */
export const BLANK_SELLER_COLUMNS: SellerNameColumns = {
  sellerUsername: null,
  sellerFirstName: null,
};
