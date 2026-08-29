import { parseDecision } from "@/ai/parseDecision";
import { getConfig } from "@/config";
import {
  markInboundEmailProcessed,
  recordInboundEmail,
  releaseInboundEmail,
} from "@/data/inboundEmails";
import { getRequestByReference } from "@/data/requests";
import { capToAnnualCents, isPlausibleCap } from "@/domain/caps";
import { InvalidTransition, ModelUnavailable } from "@/domain/errors";
import { isComplete } from "@/domain/request";
import { isProcurement, normaliseAddress } from "@/guards/procurementAllowlist";
import { extractReference, stripQuotedText } from "@/integrations/email/parseReply";
import { answerReply } from "@/services/answerReply";
import { applyDecision } from "@/services/applyDecision";
import { notifyRequester } from "@/services/notifyRequester";

export type InboundEmail = {
  messageId: string;
  from: string;
  subject: string;
  body: string;
};

export type EmailReplyResult =
  | "applied"
  | "duplicate"
  | "in_flight"
  | "not_procurement"
  | "unknown_reference"
  | "not_awaiting_decision"
  | "unclear"
  | "already_decided";

export async function handleEmailReply(email: InboundEmail): Promise<EmailReplyResult> {
  const reference = extractReference(email.subject);
  const from = normaliseAddress(email.from);

  // Checked before anything is stored: the intake address is public, so a
  // stranger must not be able to write a row or reach the model by emailing it.
  if (!isProcurement(from, getConfig().PROCUREMENT_EMAILS)) {
    console.warn({ event: "email_from_non_procurement", reference });
    return "not_procurement";
  }

  const intake = await recordInboundEmail({
    messageId: email.messageId,
    fromAddress: from,
    subject: email.subject,
    reference,
  });
  if (intake === "duplicate") return "duplicate";
  // Another attempt at this same reply is still running; it will finish the job.
  if (intake === "in_flight") {
    console.info({ event: "email_delivery_in_flight", reference });
    return "in_flight";
  }

  try {
    return await decide(email, from, reference);
  } catch (error) {
    // Given back at once, so the provider's next retry takes it over instead of
    // being told the failed attempt is still running.
    await releaseInboundEmail(email.messageId);
    throw error;
  }
}

async function decide(
  email: InboundEmail,
  from: string,
  reference: string | null,
): Promise<EmailReplyResult> {
  const finish = async (result: EmailReplyResult): Promise<EmailReplyResult> => {
    await markInboundEmailProcessed(email.messageId);
    return result;
  };

  const request = reference ? await getRequestByReference(reference) : null;
  if (!request) {
    console.warn({ event: "email_reference_unknown", reference });
    await answerReply(null, from, email.messageId, "unknown_reference");
    return finish("unknown_reference");
  }
  // Only a request with procurement can be decided; the model is not asked about any other.
  if (request.status !== "with_procurement" || !isComplete(request)) {
    console.info({ event: "email_not_awaiting_decision", reference, status: request.status });
    await answerReply(isComplete(request) ? request : null, from, email.messageId, "already_decided");
    return finish("not_awaiting_decision");
  }

  const outcome = await parseDecision(stripQuotedText(email.body));
  // Left unprocessed: the provider retries a failed delivery, and the sender is not at fault.
  if (outcome.kind === "failed") throw new ModelUnavailable(outcome.reason);

  if (outcome.kind === "unclear") {
    console.info({ event: "email_decision_unclear", reference, reason: outcome.reason });
    await answerReply(request, from, email.messageId, "unclear");
    return finish("unclear");
  }

  const { decision, note, capQuantity, capAmount, capPeriod, confidence } = outcome.reading;
  const cap = {
    quantity: capQuantity,
    annualCents: capAmount === null ? null : capToAnnualCents(capAmount, capPeriod, request),
  };

  // A limit that does not fit the request is more likely a misread than a decision.
  if (decision === "approve" && !isPlausibleCap(cap, request)) {
    console.warn({ event: "email_cap_implausible", reference });
    await answerReply(request, from, email.messageId, "cap");
    return finish("unclear");
  }

  try {
    const applied = await applyDecision({
      requestId: request.id,
      decision,
      actor: from,
      note,
      cap: decision === "approve" ? cap : null,
      reading: { confidence, model: outcome.model },
    });
    if (!applied.changed) return finish("already_decided");
    await notifyRequester(applied.request, note);
  } catch (error) {
    // A second reply that contradicts the first: the first one stands.
    if (error instanceof InvalidTransition) {
      console.warn({ event: "email_decision_too_late", reference, status: request.status });
      await answerReply(request, from, email.messageId, "already_decided");
      return finish("already_decided");
    }
    // Left unprocessed on purpose, so a redelivery gets another chance.
    throw error;
  }

  return finish("applied");
}
