import { AutoRefresh } from "@/components/AutoRefresh";
import { RequestTable } from "@/components/RequestTable";
import { listRecentPublic } from "@/data/requests";
import { describeError } from "@/domain/errors";
import type { PublicRequest } from "@/domain/privacy";
import { isFinal } from "@/domain/status";

// Rebuilt at most every few seconds. The page exists to show state changing, but a
// link that gets shared must not open a database connection per visitor.
export const revalidate = 5;

/** The page is prerendered at build, and a build must not fail because the database blinked. */
async function recent(): Promise<PublicRequest[]> {
  try {
    return await listRecentPublic(50);
  } catch (error) {
    console.error({ event: "list_failed", ...describeError(error) });
    return [];
  }
}

export default async function Home() {
  const requests = await recent();
  const guided = requests.filter((request) => request.status === "guided").length;

  return (
    <main className="mx-auto max-w-4xl px-6 py-14 sm:px-10">
      <header className="mb-12">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">
          Frontdoor
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Purchase intake</h1>
        <p className="mt-3 max-w-xl text-base text-gray-600 dark:text-gray-400">
          A front door for spending that lives in Slack and email. Small asks are answered on the
          spot, big ones are briefed to procurement. This is the read-only window.
        </p>
        {requests.length > 0 && (
          <p className="mt-3 text-sm text-gray-500">
            {guided} of the last {requests.length} requests needed nobody at all.
          </p>
        )}
      </header>
      <RequestTable requests={requests} />
      <AutoRefresh everySeconds={5} active={requests.some((request) => !isFinal(request.status))} />
    </main>
  );
}
