import { When } from "@/components/When";
import type { EventRecord } from "@/data/events";
import { formatBudget, formatQuantity } from "@/domain/format";

/** The record procurement now owns. A card, not a sourcing event: that is a later episode. */
export function EventCard({ event }: { event: EventRecord }) {
  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 dark:border-emerald-900 dark:bg-emerald-950/30">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
          Event
        </h3>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium capitalize text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
          {event.status}
        </span>
      </div>
      <p className="mt-3 text-xl font-semibold">{event.title}</p>
      <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            Quantity
          </dt>
          <dd className="mt-1 font-medium tabular-nums">
            {event.quantity === null ? "not given" : formatQuantity(event.quantity, event.unit)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            Budget
          </dt>
          <dd className="mt-1 font-medium tabular-nums">{formatBudget(event.budget)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            Owner
          </dt>
          <dd className="mt-1 font-medium capitalize">{event.owner}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-gray-500">
        Created <When date={event.createdAt} />
      </p>
    </section>
  );
}
