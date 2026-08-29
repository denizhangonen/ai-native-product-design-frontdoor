import { annualBudgetCents } from "@/domain/budget";
import { describeRequest, formatBudget, formatMoney, formatQuantity } from "@/domain/format";
import type { PolicyDecision } from "@/domain/policy";
import type { CompleteRequest, Urgency } from "@/domain/request";

export type EmailContent = {
  subject: string;
  text: string;
};

const NOT_GIVEN = "not given";

const URGENCY_LABEL: Record<Urgency, string> = {
  this_week: "this week",
  this_month: "this month",
  this_quarter: "this quarter",
  flexible: "flexible",
};

function budgetLine(request: CompleteRequest): string {
  const asRead = formatBudget(request.budget);
  const annual = annualBudgetCents(request.budget);
  if (annual === null || request.budget.period === "annual") return asRead;
  return `${asRead}, ${formatMoney(annual, request.budget.currency)}/year`;
}

/** What was not said, so procurement sees the gaps rather than guessing at them. */
function missingLine(request: CompleteRequest): string | null {
  const missing = [
    request.quantity === null ? "quantity" : null,
    request.team === null ? "team" : null,
    request.urgency === null ? "when it is needed" : null,
    request.reason === null ? "reason" : null,
  ].filter((entry): entry is string => entry !== null);
  return missing.length > 0 ? `Not in the request: ${missing.join(", ")}.` : null;
}

/** The brief. The reference in the subject is how a reply finds its way back. */
export function briefEmail(request: CompleteRequest, policy: PolicyDecision): EmailContent {
  const team = request.team ? ` for the ${request.team} team` : "";
  const lines = [
    `${request.requester.displayName} is asking to buy ${request.item}${team}.`,
    "",
    `Item:      ${request.item}`,
    `Quantity:  ${request.quantity === null ? NOT_GIVEN : formatQuantity(request.quantity, request.unit)}`,
    `Budget:    ${budgetLine(request)}`,
    `Team:      ${request.team ?? NOT_GIVEN}`,
    `Needed:    ${request.urgency ? URGENCY_LABEL[request.urgency] : NOT_GIVEN}`,
    `Reason:    ${request.reason ?? NOT_GIVEN}`,
    "",
    `Policy check: ${policy.reason}.`,
    missingLine(request),
    "",
    "Reply approve or reject. To approve with a limit, say so in plain words, for example",
    '"approve but cap at 4 seats" or "approve, up to $2,000 a year". Anything else you write',
    "is passed on to the requester as your note.",
  ].filter((line): line is string => line !== null);

  return {
    subject: `[${request.reference}] Purchase request: ${describeRequest(request)}`,
    text: lines.join("\n"),
  };
}

export type ClarificationReason = "unclear" | "cap" | "already_decided" | "unknown_reference";

const CLARIFICATION: Record<ClarificationReason, string> = {
  unclear: "I could not tell whether that was an approval or a rejection, so nothing has changed.",
  cap: "That limit did not fit the request (above what was asked for, below one, or on something the request did not have), so nothing has changed.",
  already_decided: "This request was already decided, so nothing has changed. If that is wrong, please contact the requester directly.",
  unknown_reference: "I could not match that reply to a request. The reference in the subject line, PI-####, is how a reply finds its way back.",
};

const ASKS_AGAIN: ReadonlySet<ClarificationReason> = new Set(["unclear", "cap"]);

export function clarificationEmail(
  request: CompleteRequest | null,
  reason: ClarificationReason,
): EmailContent {
  const prefix = request ? `[${request.reference}] ` : "";
  const lines = [CLARIFICATION[reason]];
  if (request) lines.push("", `The request: ${describeRequest(request)}.`);
  if (ASKS_AGAIN.has(reason)) {
    lines.push("", "Reply with approve or reject, with any limit in plain words, and I will take it from there.");
  }
  return {
    subject: ASKS_AGAIN.has(reason) ? `${prefix}Sorry, was that an approval?` : `${prefix}Nothing has changed`,
    text: lines.join("\n"),
  };
}
