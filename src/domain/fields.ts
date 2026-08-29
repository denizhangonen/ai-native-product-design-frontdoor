/** The two things the policy cannot run without. Named as the request stores them. */
export const REQUIRED_FIELDS = ["item", "budget"] as const;

export type RequiredField = (typeof REQUIRED_FIELDS)[number];

const LABELS: Record<RequiredField, string> = {
  item: "what you need",
  budget: "roughly what it costs, and whether that is per month, per year or one-off",
};

export function describeMissing(fields: RequiredField[]): string {
  return fields.map((field) => LABELS[field]).join(" and ");
}
