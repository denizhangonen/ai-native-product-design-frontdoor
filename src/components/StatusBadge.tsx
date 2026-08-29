import type { RequestStatus } from "@/domain/status";

const LABEL: Record<RequestStatus, string> = {
  received: "Reading",
  needs_detail: "Waiting for detail",
  guided: "Guided, no approval needed",
  with_procurement: "With procurement",
  rejected: "Rejected",
  event_created: "Approved, event created",
};

const TONE: Record<RequestStatus, string> = {
  received: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  needs_detail: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  guided: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  with_procurement: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  rejected: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  event_created: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${TONE[status]}`}>
      {LABEL[status]}
    </span>
  );
}
