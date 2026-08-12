import Link from 'next/link';
import type { ReactNode } from 'react';

import { PROVIDER_LABEL } from '@/lib/events';
import { GROUP_LEVEL_LABELS, type GroupLevel } from '@/lib/group-levels';
import { formatPence } from '@/lib/money';
import { badgeClassName } from '@/lib/ui';

/**
 * Everything the card is allowed to know about a listing.
 *
 * `bookingReference?: never` is the point of this type. The reference is the
 * asset — whoever holds it could attempt the provider name change — so a
 * caller still carrying that column fails to typecheck rather than leaking it.
 * An optional `never` rejects a `string` coming from a variable, not just from
 * a fresh object literal the way excess-property checking would. `sellerId` is
 * barred for the same reason: the card takes a resolved name, never an
 * identity. CLAUDE.md's ban on `as SomeType` closes the escape hatch.
 */
export type ListingCardData = {
  readonly id: string;
  readonly eventTitle: string;
  readonly circuit: string;
  readonly eventDate: string;
  readonly provider: keyof typeof PROVIDER_LABEL;
  readonly groupLevel: GroupLevel;
  readonly askingPriceInPence: number;
  readonly originalPriceInPence: number;
  readonly notes: string | null;
  readonly sellerName: string;
  readonly bookingReference?: never;
  readonly sellerId?: never;
};

type ListingCardProps = { readonly listing: ListingCardData } & (
  | {
      /** Index view: the whole card is a link to the listing. */
      readonly href: string;
      readonly headingLevel?: 'h3';
      /**
       * A linked card takes no composed rows. Nesting content inside an anchor
       * is invalid markup, and it is the only route by which the seller-only
       * booking reference could reach a public list.
       */
      readonly children?: never;
    }
  | {
      readonly href?: never;
      readonly headingLevel?: 'h1';
      /** Extra rows — the detail page's seller-only booking reference. */
      readonly children?: ReactNode;
    }
);

export function ListingCardRow({
  label,
  valueClassName = '',
  children,
}: {
  readonly label: string;
  readonly valueClassName?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-sm text-zinc-600 dark:text-zinc-400">{label}</dt>
      <dd className={`text-right ${valueClassName}`}>{children}</dd>
    </div>
  );
}

export function ListingCard({
  listing,
  href,
  headingLevel,
  children,
}: ListingCardProps) {
  const Heading = headingLevel ?? 'h3';

  const body = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className={badgeClassName}>{PROVIDER_LABEL[listing.provider]}</span>
        <span className={badgeClassName}>
          {GROUP_LEVEL_LABELS[listing.groupLevel]}
        </span>
      </div>

      <Heading
        className={`mt-3 font-semibold tracking-tight ${
          Heading === 'h1' ? 'text-3xl' : 'text-lg'
        }`}
      >
        {listing.circuit}
      </Heading>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {listing.eventTitle}
      </p>

      <dl className="mt-4 flex flex-col gap-2">
        <ListingCardRow
          label="Asking price"
          valueClassName="text-2xl font-semibold tabular-nums"
        >
          {formatPence(listing.askingPriceInPence)}
        </ListingCardRow>
        <ListingCardRow
          label="Seller paid"
          valueClassName="tabular-nums text-zinc-600 dark:text-zinc-400"
        >
          {formatPence(listing.originalPriceInPence)}
        </ListingCardRow>
        <ListingCardRow label="Listed by">{listing.sellerName}</ListingCardRow>
        {children}
      </dl>

      {listing.notes !== null && (
        <p className="mt-4 whitespace-pre-line text-sm text-zinc-700 dark:text-zinc-300">
          {listing.notes}
        </p>
      )}
    </>
  );

  if (href !== undefined) {
    return (
      <article className="rounded-lg border border-black/10 transition-colors hover:bg-black/[.03] dark:border-white/15 dark:hover:bg-white/[.06]">
        <Link href={href} className="block p-5">
          {body}
        </Link>
      </article>
    );
  }

  return (
    <article className="rounded-lg border border-black/10 p-5 dark:border-white/15">
      {body}
    </article>
  );
}
