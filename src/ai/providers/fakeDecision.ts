import type { DecisionReading } from "@/ai/schemas";
import type { BudgetPeriod } from "@/domain/request";

const APPROVE = /\b(approve[ds]?|approval|agreed|go ahead|fine|sure|ok(ay)?|yes|sign(ed)? off)\b/i;
const REJECT =
  /\b(reject(ed)?|declin(e|ed)|denied?|no can do|not approved|too (much|steep)|^no\b)\b/i;

const CAP_QUANTITY = /\b(?:cap(?:ped)?(?: it)? at|max(?:imum)?(?: of)?|only|no more than|limit(?: it)? to)\s+(\d+)\s*(?:seats?|licen[cs]es?|users?|units?|copies|subscriptions?)\b/i;
const CAP_AMOUNT = /\b(?:cap(?:ped)?(?: it)? at|max(?:imum)?(?: of)?|no more than|limit(?: it)? to|up to|but)\s+\$\s?(\d[\d,]*(?:\.\d+)?)\s*(k)?\b(?:\s*(?:\/|per|a|each)\s*(year|yr|annum|month|mo))?/i;

function periodOf(word: string | undefined): BudgetPeriod | null {
  if (!word) return null;
  return /month|mo/i.test(word) ? "monthly" : "annual";
}

/** Crude stand-in for reading procurement's reply. See fakeExtraction for why it is crude. */
export function fakeDecision(reply: string): DecisionReading {
  const quantity = reply.match(CAP_QUANTITY);
  const amount = reply.match(CAP_AMOUNT);
  const capQuantity = quantity ? Number(quantity[1]) : null;
  const capAmount = amount ? Number(amount[1].replace(/,/g, "")) * (amount[2] ? 1_000 : 1) : null;
  const capPeriod = amount ? periodOf(amount[3]) : null;

  const approves = APPROVE.test(reply);
  const rejects = REJECT.test(reply);

  // Saying both, or neither, is exactly the case that must not be guessed at.
  if (approves === rejects) {
    return { decision: "unclear", note: null, capQuantity, capAmount, capPeriod, confidence: 0.9 };
  }

  // The note is what remains once the decision word and any cap phrase are taken out.
  const note = reply
    .replace(CAP_QUANTITY, "")
    .replace(CAP_AMOUNT, "")
    .replace(APPROVE, "")
    .replace(REJECT, "")
    .replace(/^[\s,.:;!-]+|[\s,.:;!-]+$/g, "")
    .replace(/^(?:but|and|only)\b[\s,]*/i, "")
    .replace(/^[\s,.:;!-]+/, "");
  return {
    decision: approves ? "approve" : "reject",
    note: note.length > 0 ? note : null,
    capQuantity,
    capAmount,
    capPeriod,
    confidence: 0.95,
  };
}
