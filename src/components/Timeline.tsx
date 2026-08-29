import { When } from "@/components/When";
import type { TrailEntry } from "@/data/trail";
import { formatMoney } from "@/domain/format";

// What each entry means to a reader. Actors and notes are deliberately not shown:
// this page is public, actors can be email addresses, notes are procurement's words.
const DESCRIBE: Record<string, string> = {
  created: "Request received from Slack",
  detail_requested: "Asked for the missing detail in the thread",
  detail_received: "Detail received in the thread",
  guided: "Within the threshold, guided on the spot",
  routed: "Above the threshold or unclear, briefed to procurement",
  brief_failed: "The brief could not be sent; procurement not yet told",
  procurement_approved: "Approved by procurement, event created",
  procurement_rejected: "Rejected by procurement",
};

function capLine(entry: TrailEntry): string | null {
  const cap = entry.payload.cap as { quantity: number | null; annualCents: number | null } | undefined;
  if (cap?.quantity != null) return `Capped at ${cap.quantity}`;
  if (cap?.annualCents != null) return `Capped at ${formatMoney(cap.annualCents)}/year`;
  return null;
}

export function Timeline({ entries }: { entries: TrailEntry[] }) {
  if (entries.length === 0) return <p className="text-gray-500">Nothing recorded yet.</p>;
  const last = entries.length - 1;

  return (
    <ol className="relative ml-2 border-l border-gray-200 dark:border-gray-800">
      {entries.map((entry, index) => {
        const cap = capLine(entry);
        const latest = index === last;
        return (
          <li key={entry.id} className="relative pb-8 pl-8 last:pb-0" aria-current={latest ? "step" : undefined}>
            <span
              aria-hidden
              className={`absolute top-1 -left-[7px] h-3.5 w-3.5 rounded-full border-2 border-white dark:border-gray-950 ${
                latest ? "bg-violet-500" : "bg-gray-300 dark:bg-gray-700"
              }`}
            />
            <p className="text-base font-medium">
              {DESCRIBE[entry.type] ?? entry.type}
              {latest && <span className="ml-2 text-xs font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">latest</span>}
            </p>
            {cap && <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">{cap}</p>}
            <p className="mt-1 text-sm tabular-nums text-gray-500">
              <When date={entry.createdAt} />
              {entry.reading && (
                <span> · the model read this at {Math.round(entry.reading.confidence * 100)}% ({entry.reading.model})</span>
              )}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
