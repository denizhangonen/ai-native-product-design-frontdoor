import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/AutoRefresh";
import { EventCard } from "@/components/EventCard";
import { HowItWasDecided, type RecordedPolicy } from "@/components/HowItWasDecided";
import { RequestFacts } from "@/components/RequestFacts";
import { StatusBadge } from "@/components/StatusBadge";
import { Timeline } from "@/components/Timeline";
import { getEventForRequest } from "@/data/events";
import { getPublicRequestByReference } from "@/data/requests";
import { type TrailEntry, listTrail } from "@/data/trail";
import { POLICY_FLAGS, type PolicyFlag, decidePolicy } from "@/domain/policy";
import { isFinal } from "@/domain/status";
import { policyThresholdCents } from "@/services/routeRequest";

// Shared by every viewer of the link for a few seconds, so a popular request does not
// open a database connection per visitor. No reference is known at build time; each is
// rendered on first visit and then cached like any other page.
export const revalidate = 5;
export const dynamicParams = true;

export function generateStaticParams(): Array<{ reference: string }> {
  return [];
}

const REFERENCE = /^PI-\d{1,12}$/;

export async function generateMetadata({ params }: PageProps<"/r/[reference]">) {
  const { reference } = await params;
  return REFERENCE.test(reference) ? { title: reference } : {};
}

/** The rule's own words, as written on the trail when the request was routed. */
function recordedPolicy(trail: TrailEntry[]): RecordedPolicy | null {
  const entry = trail.find((e) => e.type === "guided" || e.type === "routed");
  if (!entry || typeof entry.payload.reason !== "string") return null;
  const flags = Array.isArray(entry.payload.flags) ? entry.payload.flags : [];
  return {
    route: entry.type === "guided" ? "guided" : "procurement",
    reason: entry.payload.reason,
    flags: flags.filter((flag): flag is PolicyFlag => POLICY_FLAGS.includes(flag as PolicyFlag)),
  };
}

export default async function RequestPage({ params }: PageProps<"/r/[reference]">) {
  const { reference } = await params;
  if (!REFERENCE.test(reference)) notFound();

  const request = await getPublicRequestByReference(reference);
  if (!request) notFound();

  const [trail, event] = await Promise.all([listTrail(request.id), getEventForRequest(request.id)]);
  const recorded = recordedPolicy(trail);
  const today =
    recorded && request.budget
      ? decidePolicy(request.budget, policyThresholdCents(), request.amountInMessage)
      : null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-14 sm:px-10">
      <Link
        href="/"
        className="text-sm font-medium text-violet-700 underline-offset-4 hover:underline dark:text-violet-400"
      >
        &larr; All requests
      </Link>

      <header className="mt-6 mb-10">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="font-mono">{request.reference}</span>
            <span className="text-gray-400 dark:text-gray-600"> · </span>
            {request.item ?? "waiting for detail"}
          </h1>
          <StatusBadge status={request.status} />
        </div>
        <p className="mt-3 max-w-xl text-base text-gray-600 dark:text-gray-400">
          The full trail: what was asked, what the model read, which rule fired, who decided, when.
        </p>
      </header>

      <RequestFacts request={request} />

      <h2 className="mb-5 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
        How this was decided
      </h2>
      <div className="mb-12">
        <HowItWasDecided request={request} recorded={recorded} today={today} />
      </div>

      {event && (
        <div className="mb-12">
          <EventCard event={event} />
        </div>
      )}

      <h2 className="mb-6 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
        Timeline
      </h2>
      <Timeline entries={trail} />
      <AutoRefresh everySeconds={5} active={!isFinal(request.status)} />
    </main>
  );
}
