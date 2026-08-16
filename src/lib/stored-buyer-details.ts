import { z } from 'zod';

/**
 * Reading buyer details back out of `purchases.buyer_details`.
 *
 * Separate from the input schema because the rules genuinely differ. On the way
 * in, every field of the current version is required. On the way out, the row
 * may have been written under any earlier version — `full-name.1` rows carry no
 * email at all — so every field beyond the oldest is optional here, and a
 * caller renders what it finds rather than assuming what it wants.
 *
 * Drizzle types `jsonb` as `unknown`, so this is the only way to read the
 * column: the compiler enforces the validation that CLAUDE.md asks for.
 */
export const storedBuyerDetailsSchema = z.object({
  fullName: z.string(),
  /** Absent on `full-name.1` rows, which were written before email existed. */
  email: z.string().optional(),
});

export type StoredBuyerDetails = z.infer<typeof storedBuyerDetailsSchema>;

/**
 * Returns null rather than throwing when the column holds something
 * unreadable. A seller looking at a sale they have already been paid for
 * should see "we could not read these" and a support route, not a 500 — the
 * money has moved either way.
 */
export function readStoredBuyerDetails(value: unknown): StoredBuyerDetails | null {
  const parsed = storedBuyerDetailsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
