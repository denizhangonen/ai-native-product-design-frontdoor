import { getConfig } from "@/config";
import type { PolicyDecision } from "@/domain/policy";
import type { CompleteRequest } from "@/domain/request";
import {
  type ClarificationReason,
  briefEmail,
  clarificationEmail,
} from "@/integrations/email/messages";
import { getEmailProvider } from "@/integrations/email/provider";

// RFC 3834 and the Exchange equivalent: tells a mailbox not to auto-answer this mail.
const AUTO_REPLY_HEADERS = { "Auto-Submitted": "auto-replied", "X-Auto-Response-Suppress": "All" };

async function sendTo(
  to: string,
  content: { subject: string; text: string },
  reference: string | null,
  idempotencyKey: string,
  headers?: Record<string, string>,
): Promise<void> {
  const config = getConfig();
  await getEmailProvider().send({
    to,
    from: config.EMAIL_FROM,
    // Replies come back to the address the inbound webhook listens on.
    replyTo: config.EMAIL_REPLY_TO,
    subject: content.subject,
    text: content.text,
    reference,
    headers,
    idempotencyKey,
  });
}

export async function sendBrief(request: CompleteRequest, policy: PolicyDecision): Promise<void> {
  const addresses = getConfig().PROCUREMENT_EMAILS;
  if (addresses.length === 0) {
    console.warn({ event: "no_procurement_configured", reference: request.reference });
    return;
  }
  await Promise.all(
    addresses.map((address) =>
      sendTo(address, briefEmail(request, policy), request.reference, `brief:${request.reference}:${address}`),
    ),
  );
}

/**
 * Answers a reply that changed nothing. Keyed by the reply being answered, so two
 * unclear replies still get two answers, and marked so a mailbox does not answer back.
 */
export async function sendClarification(
  request: CompleteRequest | null,
  to: string,
  inReplyTo: string,
  reason: ClarificationReason,
): Promise<void> {
  const reference = request?.reference ?? null;
  await sendTo(to, clarificationEmail(request, reason), reference, `clarify:${inReplyTo}`, AUTO_REPLY_HEADERS);
}
