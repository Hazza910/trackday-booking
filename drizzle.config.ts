import { defineConfig } from 'drizzle-kit';
import { env } from './src/env';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    // Schema migrations must use the direct (non-pooled) connection — PgBouncer
    // in transaction mode breaks session-level statements.
    url: env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
