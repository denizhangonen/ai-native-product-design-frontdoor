import type { ReactNode } from "react";
import { type PolicyDecision, type PolicyFlag, describeFlag } from "@/domain/policy";
import type { PublicRequest } from "@/domain/privacy";

type PanelProps = {
  title: string;
  footer: string;
  children: ReactNode;
};

function Panel({ title, footer, children }: PanelProps) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-gray-50/50 p-6 dark:border-gray-800 dark:bg-gray-900/40">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">
        {title}
      </h3>
      <div className="mt-3 text-base leading-relaxed">{children}</div>
      <p className="mt-4 text-sm text-gray-500">{footer}</p>
    </section>
  );
}

/** What the rule said when it ran, as written on the trail at the time. */
export type RecordedPolicy = {
  route: "guided" | "procurement";
  reason: string;
  flags: PolicyFlag[];
};

/**
 * The point of the whole system, on one screen: the model reports what it read,
 * and a rule in code decides what happens. Neither panel can do the other's job.
 */
export function HowItWasDecided({
  request,
  recorded,
  today,
}: {
  request: PublicRequest;
  /** From the trail: the words the rule wrote when the request was routed. */
  recorded: RecordedPolicy | null;
  /** The same rule run now, so a threshold changed since then shows as a difference. */
  today: PolicyDecision | null;
}) {
  const reading = request.reading;
  const changed = recorded && today && recorded.route !== today.route;

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Panel
        title="The model read"
        footer={
          reading
            ? `${Math.round(reading.confidence * 100)}% confident · ${reading.model}`
            : "Not recorded for this request"
        }
      >
        <p>{reading?.rationale ?? "No note was returned."}</p>
      </Panel>

      <Panel title="The rule decided" footer="src/domain/policy.ts, a pure function with tests">
        {recorded ? (
          <>
            <p>{recorded.reason}.</p>
            {recorded.flags.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-amber-700 dark:text-amber-400">
                {recorded.flags.map((flag) => (
                  <li key={flag}>Fails closed: {describeFlag(flag)}.</li>
                ))}
              </ul>
            )}
            {changed && (
              <p className="mt-3 text-sm text-gray-500">
                Under today&apos;s threshold the same rule would say: {today.reason}.
              </p>
            )}
          </>
        ) : (
          <p>Nothing yet: the rule needs an item and a budget, and one of them is still missing.</p>
        )}
      </Panel>
    </div>
  );
}
