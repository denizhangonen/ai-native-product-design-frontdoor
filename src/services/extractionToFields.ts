import type { Extraction } from "@/ai/schemas";
import type { RequestFields } from "@/data/requests";
import { amountAppearsIn } from "@/domain/grounding";

/**
 * Model output, already validated, becomes the fields a request stores. Cents from
 * here on, and the figure is checked against the text it was read from.
 */
export function extractionToFields(extraction: Extraction, sourceText: string): RequestFields {
  const amountCents = extraction.amount === null ? null : Math.round(extraction.amount * 100);
  return {
    amountInMessage: amountCents !== null && amountAppearsIn(amountCents, sourceText),
    item: extraction.item,
    quantity: extraction.quantity,
    unit: extraction.unit,
    budget:
      amountCents === null
        ? null
        : { amountCents, period: extraction.period, currency: extraction.currency },
    team: extraction.team,
    urgency: extraction.urgency,
    reason: extraction.reason,
  };
}
