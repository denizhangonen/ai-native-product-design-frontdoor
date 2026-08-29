import { z } from "zod";
import type { RequiredField } from "@/domain/fields";
import { BUDGET_PERIODS, URGENCIES } from "@/domain/request";

/**
 * What the model is allowed to return. Anything outside this shape is rejected
 * before it can reach the database or Slack.
 *
 * The model extracts only. It never states a route, a status, or a policy verdict.
 */
export const extractionSchema = z.object({
  item: z.string().trim().min(1).max(200).nullable(),
  quantity: z.number().int().min(1).max(100_000).nullable(),
  unit: z.string().trim().min(1).max(50).nullable(),
  /** In major units, e.g. 3000 for $3,000. Code turns it into cents. */
  amount: z.number().min(0).max(1_000_000_000).nullable(),
  period: z.enum(BUDGET_PERIODS).nullable(),
  /** ISO code as written or implied by the symbol; null when the message gave neither. */
  currency: z.string().trim().length(3).toUpperCase().nullable(),
  team: z.string().trim().min(1).max(100).nullable(),
  urgency: z.enum(URGENCIES).nullable(),
  reason: z.string().trim().min(1).max(2000).nullable(),
  /**
   * One line on how the message was read. Capped so it stays a note, not an essay,
   * and defaulted because it is presentation: a model that omits it must not cost
   * us an otherwise perfectly readable request.
   */
  rationale: z.string().trim().min(1).max(200).nullable().default(null),
  confidence: z.number().min(0).max(1),
});

export type Extraction = z.infer<typeof extractionSchema>;

/** An extraction that has every field the policy needs. */
export type CompleteExtraction = Extraction & { item: string; amount: number };

/** Code decides what is missing, not the model. */
export function missingFields(extraction: Pick<Extraction, "item" | "amount">): RequiredField[] {
  const missing: RequiredField[] = [];
  if (extraction.item === null) missing.push("item");
  if (extraction.amount === null) missing.push("budget");
  return missing;
}

/**
 * What the model may say about procurement's reply. It reports what was written;
 * whether that decision is legal, and whether a cap is plausible, is decided by the domain.
 */
export const decisionSchema = z.object({
  decision: z.enum(["approve", "reject", "unclear"]),
  note: z.string().trim().min(1).nullable(),
  /** A lower number of units than asked for, e.g. "cap at 4 seats". */
  capQuantity: z.number().int().min(0).max(100_000).nullable(),
  /** A lower spend than asked for, in major units of USD, with the period as written. */
  capAmount: z.number().min(0).max(1_000_000_000).nullable(),
  capPeriod: z.enum(BUDGET_PERIODS).nullable(),
  confidence: z.number().min(0).max(1),
});

export type DecisionReading = z.infer<typeof decisionSchema>;
