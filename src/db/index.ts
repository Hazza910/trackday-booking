import { drizzle } from 'drizzle-orm/neon-http';
import { env } from '@/env';
import * as schema from './schema';

/**
 * Drizzle client over the Neon HTTP driver, using the pooled connection.
 * Migrations use the direct connection instead — see drizzle.config.ts.
 */
export const db = drizzle(env.DATABASE_URL, { schema });
