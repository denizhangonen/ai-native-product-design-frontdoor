import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { annualBudgetCents } from "@/domain/budget";
import { formatMoney, formatQuantity } from "@/domain/format";
import type { PublicRequest } from "@/domain/privacy";

function annual(request: PublicRequest): string {
  if (!request.budget) return "";
  const cents = annualBudgetCents(request.budget);
  return cents === null ? "period not stated" : `${formatMoney(cents, request.budget.currency)}/yr`;
}

export function RequestTable({ requests }: { requests: PublicRequest[] }) {
  if (requests.length === 0) {
    return <p className="text-gray-500">No requests yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-base">
        <caption className="sr-only">Recent purchase requests</caption>
        <thead className="text-left text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
          <tr>
            <th scope="col" className="py-3 pr-6">Ref</th>
            <th scope="col" className="py-3 pr-6">Item</th>
            <th scope="col" className="py-3 pr-6">Team</th>
            <th scope="col" className="py-3 pr-6 text-right">Per year</th>
            <th scope="col" className="py-3 pl-6">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
          {requests.map((request) => (
            <tr
              key={request.id}
              className="transition-colors hover:bg-violet-50/60 dark:hover:bg-violet-950/20"
            >
              <td className="py-4 pr-6 font-mono text-[15px]">
                <Link
                  href={`/r/${request.reference}`}
                  className="font-medium text-violet-700 underline-offset-4 hover:underline dark:text-violet-400"
                >
                  {request.reference}
                </Link>
              </td>
              <td className="py-4 pr-6">
                <span className="font-medium">{request.item ?? "(not yet given)"}</span>
                {request.quantity !== null && (
                  <span className="text-gray-500"> · {formatQuantity(request.quantity, request.unit)}</span>
                )}
              </td>
              <td className="py-4 pr-6 text-gray-600 dark:text-gray-300">{request.team ?? ""}</td>
              <td className="py-4 pr-6 text-right tabular-nums text-gray-600 dark:text-gray-300">
                {annual(request)}
              </td>
              <td className="py-4 pl-6">
                <StatusBadge status={request.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
