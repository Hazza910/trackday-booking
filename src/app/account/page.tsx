import Link from 'next/link';
import { auth } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const { data: session } = await auth.getSession();

  if (!session?.user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-gray-900">
        <h1 className="mb-4 text-4xl font-bold text-white">Not logged in</h1>
        <div className="item-center flex gap-2">
          <Link href="/auth/sign-up" className="inline-flex text-lg text-indigo-400 hover:underline">
            Sign-up
          </Link>
          <Link href="/auth/sign-in" className="inline-flex text-lg text-indigo-400 hover:underline">
            Sign-in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-gray-900">
      <h1 className="mb-4 text-4xl text-white">
        Logged in as <span className="font-bold underline">{session.user.name}</span>
      </h1>
      <p className="text-gray-400">{session.user.email}</p>
    </div>
  );
}
