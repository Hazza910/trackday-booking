/**
 * Class strings shared by more than one route.
 *
 * Strings rather than components: the same badge is a `<span>` on an event row
 * and a `<Link>` for the for-sale count, so a wrapper component would have to
 * be polymorphic to serve both.
 */

export const badgeClassName =
  'rounded border border-black/15 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-600 dark:border-white/25 dark:text-zinc-300';

export const accentBadgeClassName =
  'rounded border border-indigo-500/40 bg-indigo-500/10 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-indigo-700 transition-colors hover:bg-indigo-500/20 dark:border-indigo-400/40 dark:text-indigo-300';
