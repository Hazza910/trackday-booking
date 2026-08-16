import { clerkMiddleware } from '@clerk/nextjs/server';

/**
 * Routes that require an authenticated user. A path matches if it is the
 * prefix itself or a descendant of it (`/account`, `/account/billing`).
 */
const PROTECTED_PREFIXES = ['/dashboard', '/account', '/purchases'];

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export default clerkMiddleware(async (auth, request) => {
  if (isProtected(request.nextUrl.pathname)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Run on every route except Next.js internals and static assets, so that
    // `auth()` and the Clerk components are available app-wide.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes.
    '/(api|trpc)(.*)',
  ],
};
