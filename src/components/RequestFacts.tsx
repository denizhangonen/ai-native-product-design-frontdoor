import { When } from "@/components/When";
import { formatBudget, formatQuantity } from "@/domain/format";
import type { PublicRequest } from "@/domain/privacy";
import type { Urgency } from "@/domain/request";

const URGENCY: Record<Urgency, string> = {
  this_week: "this week",
  this_month: "this month",
  this_quarter: "this quarter",
  flexible: "flexible",
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
        {label}
      </dt>
      <dd className="mt-1.5 text-base font-medium">{children}</dd>
    </div>
  );
}

/** The request as read. The type itself carries no requester and no reason: the page is public. */
export function RequestFacts({ request }: { request: PublicRequest }) {
  return (
    <dl className="mb-12 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3">
      <Fact label="Quantity">
        {request.quantity === null ? "not given" : formatQuantity(request.quantity, request.unit)}
        {request.cap?.quantity != null && (
          <span className="text-gray-500"> · capped at {request.cap.quantity}</span>
        )}
      </Fact>
      <Fact label="Budget">
        <span className="tabular-nums">{request.budget ? formatBudget(request.budget) : "not given"}</span>
      </Fact>
      <Fact label="Team">{request.team ?? "not given"}</Fact>
      <Fact label="Needed">{request.urgency ? URGENCY[request.urgency] : "not given"}</Fact>
      <Fact label="Requested">
        <span className="text-sm tabular-nums whitespace-nowrap text-gray-700 dark:text-gray-300">
          <When date={request.createdAt} />
        </span>
      </Fact>
      <Fact label="Last change">
        <span className="text-sm tabular-nums whitespace-nowrap text-gray-700 dark:text-gray-300">
          <When date={request.updatedAt} />
        </span>
      </Fact>
    </dl>
  );
}
