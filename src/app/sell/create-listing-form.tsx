'use client';

import { SignInButton, useAuth } from '@clerk/nextjs';
import { useActionState } from 'react';

import type { EventOptionGroup } from '@/lib/events';
import { GROUP_LEVELS, GROUP_LEVEL_LABELS } from '@/lib/group-levels';
import {
  EMPTY_LISTING_FORM_STATE,
  NOTES_MAX_LENGTH,
} from '@/lib/listing-form-state';

import { createListing } from './actions';

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

export function CreateListingForm({
  monthGroups,
  isSignedIn,
}: {
  monthGroups: readonly EventOptionGroup[];
  isSignedIn: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    createListing,
    EMPTY_LISTING_FORM_STATE
  );

  // The server's answer is the starting point; the live one takes over so the
  // button flips as soon as the sign-in modal closes, with no reload.
  const { isSignedIn: liveSignedIn } = useAuth();
  const signedIn = liveSignedIn ?? isSignedIn;

  const errorId = (field: string) => `${field}-error`;
  const describedBy = (field: keyof typeof state.fieldErrors) =>
    state.fieldErrors[field] ? errorId(field) : undefined;

  return (
    <form action={formAction} className="mt-10 flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="eventId" className={labelClassName}>
          Which track day?
        </label>
        <select
          id="eventId"
          name="eventId"
          defaultValue={state.values.eventId}
          aria-invalid={state.fieldErrors.eventId !== undefined}
          aria-describedby={describedBy('eventId')}
          className={fieldClassName}
        >
          <option value="">Choose an event…</option>
          {monthGroups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <FieldError id={errorId('eventId')} messages={state.fieldErrors.eventId} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="groupLevel" className={labelClassName}>
          Which group is your place in?
        </label>
        <select
          id="groupLevel"
          name="groupLevel"
          defaultValue={state.values.groupLevel}
          aria-invalid={state.fieldErrors.groupLevel !== undefined}
          aria-describedby={describedBy('groupLevel')}
          className={fieldClassName}
        >
          <option value="">Choose a group…</option>
          {GROUP_LEVELS.map((level) => (
            <option key={level} value={level}>
              {GROUP_LEVEL_LABELS[level]}
            </option>
          ))}
        </select>
        <FieldError
          id={errorId('groupLevel')}
          messages={state.fieldErrors.groupLevel}
        />
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="askingPrice" className={labelClassName}>
            Asking price
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-zinc-500">
              £
            </span>
            {/* Not type="number": the browser would localise the decimal
                separator and fight the pounds-string contract. */}
            <input
              id="askingPrice"
              name="askingPrice"
              type="text"
              inputMode="decimal"
              placeholder="120.00"
              autoComplete="off"
              defaultValue={state.values.askingPrice}
              aria-invalid={state.fieldErrors.askingPrice !== undefined}
              aria-describedby={describedBy('askingPrice')}
              className={`${fieldClassName} pl-7`}
            />
          </div>
          <FieldError
            id={errorId('askingPrice')}
            messages={state.fieldErrors.askingPrice}
          />
        </div>

        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="originalPrice" className={labelClassName}>
            What you paid
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-zinc-500">
              £
            </span>
            <input
              id="originalPrice"
              name="originalPrice"
              type="text"
              inputMode="decimal"
              placeholder="150.00"
              autoComplete="off"
              defaultValue={state.values.originalPrice}
              aria-invalid={state.fieldErrors.originalPrice !== undefined}
              aria-describedby={describedBy('originalPrice')}
              className={`${fieldClassName} pl-7`}
            />
          </div>
          <FieldError
            id={errorId('originalPrice')}
            messages={state.fieldErrors.originalPrice}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="bookingReference" className={labelClassName}>
          Booking reference
        </label>
        <input
          id="bookingReference"
          name="bookingReference"
          type="text"
          maxLength={64}
          autoComplete="off"
          defaultValue={state.values.bookingReference}
          aria-invalid={state.fieldErrors.bookingReference !== undefined}
          aria-describedby={describedBy('bookingReference')}
          className={fieldClassName}
        />
        <p className={hintClassName}>
          From your provider&rsquo;s confirmation email. Only you can see this.
        </p>
        <FieldError
          id={errorId('bookingReference')}
          messages={state.fieldErrors.bookingReference}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className={labelClassName}>
          Notes <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          maxLength={NOTES_MAX_LENGTH}
          defaultValue={state.values.notes}
          aria-invalid={state.fieldErrors.notes !== undefined}
          aria-describedby={describedBy('notes')}
          className={fieldClassName}
        />
        <p className={hintClassName}>
          No phone numbers, emails, social handles or payment details — buyers
          pay through the site. {NOTES_MAX_LENGTH} characters max.
        </p>
        <FieldError id={errorId('notes')} messages={state.fieldErrors.notes} />
      </div>

      {state.formError !== null && (
        <p
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400"
        >
          {state.formError}
        </p>
      )}

      <div className="flex items-center gap-3">
        {signedIn ? (
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-60"
          >
            {pending ? 'Publishing…' : 'Publish listing'}
          </button>
        ) : (
          <SignInButton mode="modal">
            <button
              type="button"
              className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
            >
              Sign in to publish
            </button>
          </SignInButton>
        )}
        <p className={hintClassName}>
          You transfer the booking yourself once it sells.
        </p>
      </div>
    </form>
  );
}
