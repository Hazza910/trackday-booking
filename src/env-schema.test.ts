import { describe, expect, it } from 'vitest';

import { envSchema } from './env-schema';

const required = {
  DATABASE_URL: 'postgres://user:pass@host/db',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_clerk',
  CLERK_SECRET_KEY: 'sk_test_clerk',
};

const parse = (extra: Record<string, unknown> = {}) =>
  envSchema.safeParse({ ...required, ...extra });

describe('the environment schema', () => {
  it('boots with nothing but the database and Clerk configured', () => {
    // The whole point of the Stripe keys being optional: the app has to run —
    // and `pnpm dev` has to work — before anyone has added them.
    expect(parse().success).toBe(true);
  });

  it('accepts correctly-prefixed Stripe keys', () => {
    const result = parse({
      STRIPE_SECRET_KEY: 'sk_test_123',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_123',
      STRIPE_WEBHOOK_SIGNING_SECRET: 'whsec_123',
    });
    expect(result.success).toBe(true);
  });

  it('catches a publishable key pasted into the secret slot', () => {
    // The failure this exists to prevent: caught here at boot, rather than by
    // Stripe halfway through somebody's checkout.
    expect(parse({ STRIPE_SECRET_KEY: 'pk_test_123' }).success).toBe(false);
  });

  it('catches a secret key pasted into the publishable slot', () => {
    expect(
      parse({ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'sk_test_123' }).success
    ).toBe(false);
  });

  it('catches a signing secret that is not one', () => {
    expect(parse({ STRIPE_WEBHOOK_SIGNING_SECRET: 'sk_test_123' }).success).toBe(
      false
    );
  });

  it.each([
    'STRIPE_SECRET_KEY',
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'STRIPE_WEBHOOK_SIGNING_SECRET',
    'CLERK_WEBHOOK_SIGNING_SECRET',
  ])('treats an empty %s as absent rather than invalid', (key) => {
    // `FOO=` in .env.local yields ''. Failing that would throw at import and
    // take down every page, when the intent is that one flow stops.
    const result = parse({ [key]: '' });
    expect(result.success).toBe(true);
    expect(result.success && result.data[key as keyof typeof result.data]).toBe(
      undefined
    );
  });

  it('still demands the keys the whole app depends on', () => {
    for (const key of [
      'DATABASE_URL',
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      'CLERK_SECRET_KEY',
    ]) {
      const incomplete = { ...required, [key]: undefined };
      expect(envSchema.safeParse(incomplete).success).toBe(false);
    }
  });

  it('rejects a database url that is not a url', () => {
    expect(parse({ DATABASE_URL: 'not-a-url' }).success).toBe(false);
  });
});
