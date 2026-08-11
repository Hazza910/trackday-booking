export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        Buy and sell UK track day places
      </h1>
      <p className="mt-3 max-w-prose text-zinc-600 dark:text-zinc-400">
        Can&apos;t make your track day? List it here. Sellers pass their place
        on at a fair price and buyers pick up a sold-out date — the booking
        moves across using the provider&apos;s free name-change process.
      </p>
      <p className="mt-10 rounded-lg border border-dashed border-black/15 px-6 py-10 text-center text-zinc-500 dark:border-white/20">
        Listings are coming soon.
      </p>
    </main>
  );
}
