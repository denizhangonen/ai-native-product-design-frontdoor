import { approvedFigures } from "@/domain/caps";
import { type RequiredField, describeMissing } from "@/domain/fields";
import { describeRequest, formatBudget, formatQuantity } from "@/domain/format";
import type { PolicyDecision } from "@/domain/policy";
import type { CompleteRequest } from "@/domain/request";

const EXAMPLE =
  "Something like: Need Figma for the design team, 5 seats, about $3k/year, sometime this month.";

function summary(request: CompleteRequest): string {
  const team = request.team ? ` for the ${request.team} team` : "";
  return `${describeRequest(request)}${team}`;
}

/** Says back what was understood, so a misread is obvious immediately. */
export function understood(
  request: CompleteRequest,
  policy: PolicyDecision,
  policyUrl: string,
): string {
  const outcome =
    policy.route === "guided"
      ? `${policy.reason}, so no approval is needed: use the team card. Policy: ${policyUrl}\nLogged for finance visibility.`
      : `${policy.reason}. Routing to procurement with a brief.`;

  return `Understood: ${summary(request)}.\n${outcome}\nReference ${request.reference}.`;
}

/** Said instead of "routing to procurement" when the brief could not be sent. */
export function briefNotSent(request: CompleteRequest): string {
  return `Understood: ${summary(request)}, and it needs procurement. The brief could not be sent just now, so procurement has not been told yet. Your request is saved as ${request.reference}; the team will follow up.`;
}

export function needMoreDetail(missing: RequiredField[]): string {
  return `Almost there, I could not find ${describeMissing(missing)}. Reply here in this thread and I will pick it up.`;
}

export function startFresh(missing: RequiredField[]): string {
  return `I still could not find ${describeMissing(missing)}. Please post a fresh request in the channel with everything in one message. ${EXAMPLE}`;
}

export function somethingWentWrong(): string {
  return "Something went wrong on my side and that message was not handled. Please say it again in a minute.";
}

export function stillReading(): string {
  return "I am still reading your first message. Give me a moment and say that again.";
}

export function notUnderstood(): string {
  return `I could not read that as a purchase request. ${EXAMPLE}`;
}

/** The outcome, in the thread where the requester asked. */
export function decided(request: CompleteRequest, note: string | null): string {
  let verdict: string;
  if (request.status === "event_created") {
    const approved = approvedFigures(request, request.cap);
    const asApproved = describeRequest({ ...request, ...approved });
    const asked =
      request.cap?.quantity != null && request.quantity !== null
        ? ` (asked for ${formatQuantity(request.quantity, request.unit)})`
        : request.cap?.annualCents != null
          ? ` (asked for ${formatBudget(request.budget)})`
          : "";
    const how = request.cap ? "Approved by procurement, with a limit" : "Approved by procurement";
    verdict = `${how}: ${asApproved}${asked}.\nAn event has been created; procurement owns it from here.`;
  } else {
    verdict = `Rejected by procurement: ${describeRequest(request)}.`;
  }
  return note ? `${verdict}\nNote: ${note}` : verdict;
}
