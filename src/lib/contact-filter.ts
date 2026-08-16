/**
 * Rejects free text that tries to move a buyer off-platform.
 *
 * The whole business model is that the sale happens here: the seller gets paid
 * through the site and the provider name change follows. A phone number or an
 * Instagram handle in the notes routes around that, so notes carrying contact
 * details are refused outright rather than quietly stripped — a seller who
 * meant no harm can see exactly what to remove.
 *
 * Pure and dependency-free so it can be reused wherever sellers and buyers
 * write to each other (the endurance board is next).
 *
 * ## What it does not do
 *
 * This is friction, not a security control. It is straightforwardly evadable
 * by anyone determined: "whats app", "zero seven seven...", "gmail dot com",
 * or a homoglyph will all pass. It also only runs at write time, so widening
 * the keyword list never re-checks rows already stored.
 *
 * Two known false positives, both accepted deliberately:
 * - Separators are stripped before digits are counted, so an ISO date like
 *   "2026-08-12" collapses to 8 digits and reads as an account number.
 * - For the same reason, two numbers separated only by punctuation can merge
 *   into one run ("paid 1000, 1000" collapses to 8 digits).
 */

export type ContactFilterReason =
  | 'email'
  | 'at-symbol'
  | 'url'
  | 'phone-number'
  | 'sort-code'
  | 'account-number'
  | 'contact-keyword';

export type ContactFilterResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasons: readonly ContactFilterReason[] };

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

const EXPLICIT_URL = /\b(?:https?:\/\/|www\.)/i;

/**
 * Bare domains, restricted to TLDs that do not read as ordinary prose.
 * Deliberately absent: `to`, `me`, `be`, `at`, `is`, `so`, `in` — "great
 * day.To be fair" would otherwise match. `co.uk` precedes `uk` so the longer
 * suffix wins.
 */
const BARE_DOMAIN =
  /\b[a-z0-9-]+\.(?:co\.uk|com|net|org|io|uk|app|link|live|shop|store|info|biz|xyz|gg|tv|ly)\b/i;

/** Sort codes collapse to only six digits, so they need matching before that. */
const SORT_CODE = /\b\d{2}[-\s]\d{2}[-\s]\d{2}\b/;

/**
 * Word boundaries on both sides are what keep "instant" from tripping `insta`
 * and "admin" from tripping `dm`. Longer tokens precede their prefixes.
 */
const CONTACT_KEYWORDS =
  /\b(?:whatsapp|instagram|insta|facebook|messenger|snapchat|telegram|paypal|fb|dm|bank[\s-]+transfer)\b/i;

/** Characters a human uses to break up a long number. */
const NUMBER_SEPARATORS = /[\s()\-–—.,+]/g;

export function checkForContactDetails(text: string): ContactFilterResult {
  const reasons: ContactFilterReason[] = [];

  // Emails are removed before the URL and @ checks so that one address reports
  // one reason, not three.
  const withoutEmails = text.replace(EMAIL, ' ');
  if (withoutEmails !== text) {
    reasons.push('email');
  } else if (text.includes('@')) {
    reasons.push('at-symbol');
  }

  if (EXPLICIT_URL.test(withoutEmails) || BARE_DOMAIN.test(withoutEmails)) {
    reasons.push('url');
  }

  if (SORT_CODE.test(text)) {
    reasons.push('sort-code');
  }

  // Each digit run is classified once, by length, so an 11-digit phone number
  // can never also be reported as an 8-digit account number.
  const collapsed = text.replace(NUMBER_SEPARATORS, '');
  for (const run of collapsed.match(/\d+/g) ?? []) {
    if (run.length >= 10) {
      if (!reasons.includes('phone-number')) reasons.push('phone-number');
    } else if (run.length === 8) {
      if (!reasons.includes('account-number')) reasons.push('account-number');
    }
  }

  if (CONTACT_KEYWORDS.test(text)) {
    reasons.push('contact-keyword');
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

const REASON_DESCRIPTIONS: Record<ContactFilterReason, string> = {
  email: 'an email address',
  'at-symbol': 'an @ handle',
  url: 'a web address',
  'phone-number': 'a phone number',
  'sort-code': 'a sort code',
  'account-number': 'an account number',
  'contact-keyword': 'a way to make contact off-site',
};

/**
 * Turns a rejection into something the writer can act on.
 *
 * `subject` is the whole lead-in clause rather than a noun, because the verb
 * has to agree with it — "Your notes look like they contain" against "That
 * name looks like it contains". The filter is reused across fields, and a
 * message telling a buyer to fix their "notes" when they typed a name is the
 * kind of thing that makes people distrust the rest of the page.
 */
export function describeContactFilterReasons(
  result: ContactFilterResult,
  subject = 'Your notes look like they contain'
) {
  if (result.ok) {
    return '';
  }

  const described = result.reasons.map((reason) => REASON_DESCRIPTIONS[reason]);
  const listed =
    described.length === 1
      ? described[0]
      : `${described.slice(0, -1).join(', ')} and ${described.at(-1)}`;

  return `${subject} ${listed}. Buyers pay and message through the site, so please take that out.`;
}
