import { auth, currentUser } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const user = await currentUser();

  // The proxy already gates /account, but re-check at the resource itself so
  // the page is never readable if the matcher and the route ever diverge.
  if (!user) {
    const { redirectToSignIn } = await auth();
    return redirectToSignIn();
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-gray-900">
      <h1 className="mb-4 text-4xl text-white">
        Logged in as{' '}
        <span className="font-bold underline">
          {user.fullName ?? user.primaryEmailAddress?.emailAddress}
        </span>
      </h1>
      <p className="text-gray-400">{user.primaryEmailAddress?.emailAddress}</p>
    </div>
  );
}
