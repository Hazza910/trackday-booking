import { z } from 'zod';

/**
 * The shape of the environment, kept apart from the module that reads it.
 *
 * `src/env.ts` parses `process.env` at import and throws on failure, which is
 * what makes a misconfiguration loud instead of mysterious — but it also means
 * importing it from a test would throw before a single assertion ran. The rules
 * live here so they can be tested; the reading and the throwing stay there.
 */

/**
 * An optional key with a required prefix.
 *
 * The preprocess step is what makes `FOO=` in .env.local count as absent: an
 * empty value would otherwise fail the prefix check, throw at import, and take
 * down every page — when the intent is that only the flow needing it stops.
 */
function optionalKey(prefix: string) {
  return z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().startsWith(prefix).optional()
  );
}

export const envSchema = z.object({
  /** Pooled Neon connection — used by the app at runtime. */
  DATABASE_URL: z.url(),
  /**
   * Direct (non-pooled) Neon connection. Migrations, dumps and logical
   * replication must not go through PgBouncer, so drizzle-kit prefers this.
   */
  DATABASE_URL_UNPOOLED: z.url().optional(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().startsWith('pk_'),
  CLERK_SECRET_KEY: z.string().startsWith('sk_'),
  /**
   * Signs the Clerk webhooks that keep seller names current. Optional so the
   * app still boots without it — the webhook route is the only thing that
   * needs it, and it fails closed with a 500 rather than taking down every
   * other page at import time.
   */
  CLERK_WEBHOOK_SIGNING_SECRET: optionalKey('whsec_'),
  /**
   * Stripe, all optional for the same reason: this schema is parsed at import,
   * so a required-but-absent key would take down every page in the app rather
   * than the one flow that needs it. Absent keys fail closed at the payment
   * path instead, which keeps the rest of the site — and `pnpm dev` before the
   * keys are added — working.
   *
   * Prefix-checked so a publishable key pasted into the secret slot is caught
   * here, rather than by Stripe halfway through somebody's checkout.
   */
  STRIPE_SECRET_KEY: optionalKey('sk_'),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalKey('pk_'),
  STRIPE_WEBHOOK_SIGNING_SECRET: optionalKey('whsec_'),
});
