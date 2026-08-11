# Trackday Booking

## Rules (read first)
- Auth is Clerk. Never add or reinstate @neondatabase/auth.
- This is an App Router project — never create a pages/ directory.
- Never handle credentials — I add all keys to .env.local myself.
- Run `pnpm tsc --noEmit` and tests before claiming a task done.
- Never modify existing migration files — generate new ones.
- Flag race conditions or unhandled failure paths; don't work around them.
- All work goes on a feature branch (`feat/`, `fix/`, `docs/` prefix) with a PR to main. Never commit directly to main.

## Stack
Next.js App Router, TypeScript strict, Drizzle + Postgres (Neon),
Clerk auth, Stripe, Tailwind, Vitest + Playwright.

## Commands
- Dev: `pnpm dev`
- Typecheck: `pnpm tsc --noEmit`
- Test: `pnpm test`
- Migrations: `pnpm drizzle-kit generate` then `pnpm drizzle-kit migrate`

## Conventions
- Server Components by default; 'use client' only where interactivity requires it.
- Mutations via Server Actions. Route handlers only for webhooks.
- Zod validation at every boundary. Never `as SomeType`.
- Money = integer pence. Timestamps = timezone-aware UTC, stored UTC.
- Import env from `src/env.ts`, never `process.env` directly.
@AGENTS.md
