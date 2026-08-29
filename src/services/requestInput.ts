import { z } from "zod";
import { BUDGET_PERIODS, URGENCIES } from "@/domain/request";

export const requesterSchema = z.object({
  slackUserId: z.string().min(1),
  displayName: z.string().min(1),
});

export const budgetSchema = z.object({
  amountCents: z.number().int().min(0).max(1_000_000_000_00),
  period: z.enum(BUDGET_PERIODS).nullable(),
  currency: z.string().length(3).toUpperCase().nullable(),
});

export const readingSchema = z
  .object({
    confidence: z.number().min(0).max(1),
    rationale: z.string().max(200).nullable(),
    model: z.string().min(1).max(100),
  })
  .nullable()
  .default(null);

/** The fields a message can carry. Null where it did not say. */
export const fieldsSchema = z.object({
  /** Code checked the figure is written in the message. Absent means not checked, so false. */
  amountInMessage: z.boolean().default(false),
  item: z.string().min(1).max(200).nullable(),
  quantity: z.number().int().min(1).max(100_000).nullable(),
  unit: z.string().min(1).max(50).nullable(),
  budget: budgetSchema.nullable(),
  team: z.string().min(1).max(100).nullable(),
  urgency: z.enum(URGENCIES).nullable(),
  reason: z.string().min(1).max(2000).nullable(),
});

/** Paths only in the error: the values themselves may be someone's purchase details. */
export function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => issue.path.join(".")).join(", ");
}
