'use client';

import { SignInButton, useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useActionState } from 'react';

import { EMPTY_BUY_FORM_STATE } from '@/lib/buy-form-state';
import { FULL_NAME_MAX_LENGTH } from '@/lib/buyer-details';
import { FINAL_SALE_CONSENT, RISK_CONSENT } from '@/lib/consent';

import { startPurchase } from './actions';

const fieldClassName =
  'w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-white/20 dark:focus:border-indigo-400';

const labelClassName = 'text-sm font-medium';

const hintClassName = 'text-xs text-zinc-500';

function FieldError({
  id,
  messages,
}: {
  id: string;
  messages: readonly string[] | undefined;
}) {
  if (messages === undefined || messages.length === 0) {
    return null;
  }

  return (
    <p id={id} className="text-sm text-red-600 dark:text-red-400">
      {messages[0]}
    </p>
  );
}

export function BuyForm({
  listingId,
  riskWarningRequired,
  isSignedIn,
}: {
  listingId: string;
  riskWarningRequired: boolean;
  isSignedIn: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    startPurchase,
    EMPTY_BUY_FORM_STATE
  );

  // The server's answer is the starting point; the live one takes over so the
  // button flips as soon as the sign-in modal closes, with no reload.
  const { isSignedIn: liveSignedIn } = useAuth();
  const signedIn = liveSignedIn ?? isSignedIn;

  const errorId = (field: string) => `${field}-error`;
  const describedBy = (field: keyof typeof state.fieldErrors) =>
    state.fieldErrors[field] ? errorId(field) : undefined;

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-6">
      <input type="hidden" name="listingId" value={listingId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="fullName" className={labelClassName}>
          Name for the booking
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          maxLength={FULL_NAME_MAX_LENGTH}
          autoComplete="name"
          defaultValue={state.values.fullName}
          aria-invalid={state.fieldErrors.fullName !== undefined}
          aria-describedby={describedBy('fullName')}
          className={fieldClassName}
        />
        <p className={hintClassName}>
          The name the seller puts on the booking transfer. It goes to them and
          to the provider.
        </p>
        <FieldError id={errorId('fullName')} messages={state.fieldErrors.fullName} />
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
        {/* Never pre-ticked, and each gate is its own box — one box covering
            both would make a single click stand for two different things. */}
        <label className="flex gap-3 text-sm">
          <input
            type="checkbox"
            name="acceptFinalSale"
            value="on"
            defaultChecked={state.values.acceptFinalSale === 'on'}
            aria-invalid={state.fieldErrors.acceptFinalSale !== undefined}
            aria-describedby={describedBy('acceptFinalSale')}
            className="mt-0.5 size-4 shrink-0"
          />
          <span>{FINAL_SALE_CONSENT}</span>
        </label>
        <FieldError
          id={errorId('acceptFinalSale')}
          messages={state.fieldErrors.acceptFinalSale}
        />

        {riskWarningRequired && (
          <>
            <label className="flex gap-3 border-t border-black/10 pt-3 text-sm dark:border-white/15">
              <input
                type="checkbox"
                name="acceptRisk"
                value="on"
                defaultChecked={state.values.acceptRisk === 'on'}
                aria-invalid={state.fieldErrors.acceptRisk !== undefined}
                aria-describedby={describedBy('acceptRisk')}
                className="mt-0.5 size-4 shrink-0"
              />
              <span>{RISK_CONSENT}</span>
            </label>
            <FieldError
              id={errorId('acceptRisk')}
              messages={state.fieldErrors.acceptRisk}
            />
          </>
        )}
      </div>

      {state.formError !== null && (
        <div
          role="alert"
          className={
            state.raceLost
              ? 'rounded-lg border border-amber-600/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400'
              : 'rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400'
          }
        >
          <p>{state.formError}</p>
          {state.raceLost && (
            <p className="mt-2">
              Nothing you typed has been lost — leave this page open and try
              again in a few minutes, or{' '}
              <Link href="/listings" className="underline underline-offset-4">
                look at the other listings
              </Link>
              .
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        {signedIn ? (
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-60"
          >
            {pending ? 'Holding your place…' : 'Continue to payment'}
          </button>
        ) : (
          <SignInButton mode="modal">
            <button
              type="button"
              className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
            >
              Sign in to buy
            </button>
          </SignInButton>
        )}
        <p className={hintClassName}>
          This holds the place for 10 minutes. You pay on the next step.
        </p>
      </div>
    </form>
  );
}
