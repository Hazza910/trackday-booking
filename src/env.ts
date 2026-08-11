import { z } from 'zod';

/**
 * Validated environment. Import `env` from here — never read `process.env`
 * directly (see CLAUDE.md).
 *
 * Server-only: this module validates `CLERK_SECRET_KEY`, so it must not be
 * imported from a Client Component. In the browser the secret is absent and
 * validation would throw.
 */
const envSchema = z.object({
  /** Pooled Neon connection — used by the app at runtime. */
  DATABASE_URL: z.url(),
  /**
   * Direct (non-pooled) Neon connection. Migrations, dumps and logical
   * replication must not go through PgBouncer, so drizzle-kit prefers this.
   */
  DATABASE_URL_UNPOOLED: z.url().optional(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().startsWith('pk_'),
  CLERK_SECRET_KEY: z.string().startsWith('sk_'),
});

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
});

if (!parsed.success) {
  throw new Error(
    `Invalid environment variables:\n${z.prettifyError(parsed.error)}`
  );
}

export const env = parsed.data;
