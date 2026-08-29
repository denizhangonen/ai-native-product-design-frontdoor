import { completeValidated, readJson } from "@/ai/complete";
import { quotedNote } from "@/ai/groundNote";
import { PARSE_DECISION_SYSTEM_PROMPT } from "@/ai/prompts/parseDecision";
import { type DecisionReading, decisionSchema } from "@/ai/schemas";
import { getConfig } from "@/config";

export type DecisionOutcome =
  | {
      kind: "decided";
      reading: DecisionReading & { decision: "approve" | "reject" };
      model: string;
    }
  | { kind: "unclear"; reason: string }
  /** The model could not be reached or answered nonsense twice. Not the sender's fault. */
  | { kind: "failed"; reason: string };

function readDecision(raw: string): DecisionReading | null {
  return readJson(raw, (payload) => {
    const result = decisionSchema.safeParse(payload);
    return result.success ? result.data : null;
  });
}

/**
 * Reads procurement's reply. Anything short of a plain approval or rejection
 * comes back unclear, so the state is never changed on a guess.
 */
export async function parseDecision(reply: string): Promise<DecisionOutcome> {
  const outcome = await completeValidated(
    "parse_decision",
    PARSE_DECISION_SYSTEM_PROMPT,
    reply,
    readDecision,
  );
  if (outcome.kind === "failed") return outcome;

  const { value: reading, model } = outcome;
  const { decision } = reading;
  if (decision === "unclear") return { kind: "unclear", reason: "reply was not a decision" };
  if (reading.confidence < getConfig().MIN_PARSE_CONFIDENCE) {
    return { kind: "unclear", reason: "not confident enough to act" };
  }

  // The note is passed on to the requester as procurement's own words, so it must be theirs.
  const note = quotedNote(reading.note, reply);
  if (reading.note && !note) console.warn({ event: "decision_note_not_in_reply" });

  return { kind: "decided", reading: { ...reading, decision, note }, model };
}
