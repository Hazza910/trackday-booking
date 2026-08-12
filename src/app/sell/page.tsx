import { auth } from '@clerk/nextjs/server';
import { asc, gte } from 'drizzle-orm';

import { db } from '@/db';
import { events } from '@/db/schema';
import { toEventOptionGroups, todayIso } from '@/lib/events';

import { CreateListingForm } from './create-listing-form';

export const dynamic = 'force-dynamic';

export default async function SellPage() {
  const { userId } = await auth();

  // Only the columns the dropdown needs — sourceUrl and createdAt have no
  // business crossing into the client bundle.
  const upcoming = await db
    .select({
      id: events.id,
      provider: events.provider,
      title: events.title,
      circuit: events.circuit,
      eventDate: events.eventDate,
    })
    .from(events)
    .where(gte(events.eventDate, todayIso()))
    .orderBy(asc(events.eventDate), asc(events.circuit), asc(events.title));

  const monthGroups = toEventOptionGroups(upcoming);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        List your track day
      </h1>
      <p className="mt-3 max-w-prose text-zinc-600 dark:text-zinc-400">
        Can&rsquo;t make a date you&rsquo;ve booked? List it here. When it
        sells, you transfer the booking to the buyer through your
        provider&rsquo;s free name-change process.
      </p>

      {monthGroups.length === 0 ? (
        <p className="mt-10 rounded-lg border border-dashed border-black/15 px-6 py-10 text-center text-zinc-500 dark:border-white/20">
          No upcoming events to list against just now. Please check back soon.
        </p>
      ) : (
        <CreateListingForm
          monthGroups={monthGroups}
          isSignedIn={userId !== null}
        />
      )}
    </main>
  );
}
