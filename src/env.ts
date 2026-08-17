import { z } from 'zod';

import { envSchema } from './env-schema';

/**
 * Validated environment. Import `env` from here — never read `process.env`
 * directly (see CLAUDE.md).
 *
 * Server-only: this module validates `CLERK_SECRET_KEY`, so it must not be
 * imported from a Client Component. In the browser the secret is absent and
 * validation would throw. Anything the browser genuinely needs — the Stripe
 * publishable key, for one — travels as a prop from a Server Component.
 *
 * The rules themselves live in `env-schema.ts` so they can be tested without
 * this module's import-time parse getting in the way.
 */

/**
 * Each variable is listed explicitly rather than passing `process.env` as a
 * whole: Next.js only inlines literal `process.env.NEXT_PUBLIC_*` references
 * into the bundle, so a dynamic lookup would come back undefined.
 */
const parsed = envSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  CLERK_WEBHOOK_SIGNING_SECRET: process.env.CLERK_WEBHOOK_SIGNING_SECRET,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  STRIPE_WEBHOOK_SIGNING_SECRET: process.env.STRIPE_WEBHOOK_SIGNING_SECRET,
});

if (!parsed.success) {
  throw new Error(
    `Invalid environment variables:\n${z.prettifyError(parsed.error)}`
  );
}

export const env = parsed.data;
