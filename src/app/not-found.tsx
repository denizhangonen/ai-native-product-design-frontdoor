import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-14 sm:px-10">
      <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">
        Frontdoor
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">No such request</h1>
      <p className="mt-3 text-base text-gray-600 dark:text-gray-400">
        References look like PI-1042. This one is not on the list.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block text-sm font-medium text-violet-700 underline-offset-4 hover:underline dark:text-violet-400"
      >
        &larr; All requests
      </Link>
    </main>
  );
}
