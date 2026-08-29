import { completeValidated, readJson } from "@/ai/complete";
import { PARSE_REQUEST_SYSTEM_PROMPT } from "@/ai/prompts/parseRequest";
import {
  type CompleteExtraction,
  type Extraction,
  extractionSchema,
  missingFields,
} from "@/ai/schemas";
import { getConfig } from "@/config";
import type { RequiredField } from "@/domain/fields";

export type ParseOutcome =
  | { kind: "parsed"; extraction: CompleteExtraction; model: string }
  | { kind: "incomplete"; extraction: Extraction; missing: RequiredField[]; model: string }
  | { kind: "unreadable"; reason: string }
  /** The model could not be reached or answered nonsense twice. Not the person's fault. */
  | { kind: "failed"; reason: string };

function readExtraction(raw: string): Extraction | null {
  return readJson(raw, (payload) => {
    const result = extractionSchema.safeParse(payload);
    return result.success ? result.data : null;
  });
}

/**
 * Turns a Slack message into structured fields. The result is validated before
 * it leaves this function, so nothing downstream ever sees raw model output.
 */
export async function parseRequest(message: string): Promise<ParseOutcome> {
  const outcome = await completeValidated(
    "parse_request",
    PARSE_REQUEST_SYSTEM_PROMPT,
    message,
    readExtraction,
  );
  if (outcome.kind === "failed") return outcome;

  const { value: extraction, model } = outcome;
  if (extraction.confidence < getConfig().MIN_PARSE_CONFIDENCE) {
    return { kind: "unreadable", reason: "not recognised as a purchase request" };
  }

  const missing = missingFields(extraction);
  if (missing.length > 0) return { kind: "incomplete", extraction, missing, model };

  // Narrowed once here, where the check just proved it, so callers need no casts.
  return { kind: "parsed", extraction: extraction as CompleteExtraction, model };
}
