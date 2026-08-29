// Times are shown in Turkey time (UTC+3, no DST): the audience for this page lives
// there. The zone travels in the element's title, so anyone else can check.
export const TIME_ZONE = "Europe/Istanbul";

const formatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

export function formatWhen(date: Date): string {
  return formatter.format(date);
}
