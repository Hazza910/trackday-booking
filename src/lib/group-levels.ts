/**
 * Rider groups a track day place can be booked into.
 *
 * This tuple is the single source of truth: `src/db/schema.ts` builds the
 * `group_level` pgEnum from it, so the database and the form cannot drift
 * apart. It lives here rather than beside the table because the form is a
 * Client Component, and importing the schema would pull Drizzle into the
 * browser bundle.
 */
export const GROUP_LEVELS = ['novice', 'intermediate', 'advanced'] as const;

export type GroupLevel = (typeof GROUP_LEVELS)[number];

export const GROUP_LEVEL_LABELS: Record<GroupLevel, string> = {
  novice: 'Novice',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};
