import { TIME_ZONE, formatWhen } from "@/components/format";

/** A time the page shows, with the machine-readable instant and the zone on hover. */
export function When({ date }: { date: Date }) {
  return (
    <time dateTime={date.toISOString()} title={`${TIME_ZONE}, ${date.toISOString()}`}>
      {formatWhen(date)}
    </time>
  );
}
