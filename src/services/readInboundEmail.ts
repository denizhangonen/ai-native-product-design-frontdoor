import { getConfig } from "@/config";
import { verifyEmailSignature } from "@/guards/emailSignature";
import { verifyResendSignature } from "@/guards/resendSignature";
import { normaliseAddress } from "@/guards/procurementAllowlist";
import { checkSenderAuthentication } from "@/guards/senderAuthentication";
import { htmlToText } from "@/integrations/email/htmlToText";
import {
  RECEIVED_EVENT,
  resendEventSchema,
  selfSignedPayloadSchema,
} from "@/integrations/email/inboundPayload";
import { fetchReceivedEmail } from "@/integrations/email/providers/resend";
import type { InboundEmail } from "@/services/handleEmailReply";

// A reply only needs its opening lines. This bounds the work before the model's own cap.
const MAX_BODY_CHARS = 20_000;

export type InboundEmailRead =
  | { kind: "ok"; email: InboundEmail }
  | { kind: "unauthorised" }
  | { kind: "unauthenticated_sender" }
  | { kind: "malformed" }
  | { kind: "ignored" }
  | { kind: "not_configured" };

/** Turns a raw delivery into a reply we trust, whichever provider sent it. */
export async function readInboundEmail(body: string, headers: Headers): Promise<InboundEmailRead> {
  const config = getConfig();
  return config.EMAIL_PROVIDER === "resend"
    ? readFromResend(body, headers)
    : readSelfSigned(body, headers);
}

function readSelfSigned(body: string, headers: Headers): InboundEmailRead {
  const secret = getConfig().EMAIL_INBOUND_SECRET;
  if (!secret) {
    console.error({ event: "email_inbound_not_configured" });
    return { kind: "not_configured" };
  }

  const verified = verifyEmailSignature({
    body,
    timestamp: headers.get("x-frontdoor-timestamp"),
    signature: headers.get("x-frontdoor-signature"),
    secret,
  });
  if (!verified) return { kind: "unauthorised" };

  const parsed = selfSignedPayloadSchema.safeParse(readJson(body));
  if (!parsed.success) return { kind: "malformed" };

  return {
    kind: "ok",
    email: { ...parsed.data, body: parsed.data.body.slice(0, MAX_BODY_CHARS) },
  };
}

async function readFromResend(body: string, headers: Headers): Promise<InboundEmailRead> {
  const config = getConfig();
  if (!config.RESEND_WEBHOOK_SECRET || !config.RESEND_API_KEY) {
    console.error({ event: "email_inbound_not_configured" });
    return { kind: "not_configured" };
  }

  const verified = verifyResendSignature({
    body,
    id: headers.get("svix-id"),
    timestamp: headers.get("svix-timestamp"),
    signature: headers.get("svix-signature"),
    secret: config.RESEND_WEBHOOK_SECRET,
  });
  if (!verified) return { kind: "unauthorised" };

  const parsed = resendEventSchema.safeParse(readJson(body));
  if (!parsed.success) return { kind: "malformed" };

  const event = parsed.data;
  if (event.type !== RECEIVED_EVENT) {
    console.info({ event: "email_event_ignored", type: event.type });
    return { kind: "ignored" };
  }

  // The domain is shared with other apps and Resend fans every received email out to
  // all of them. Mail addressed elsewhere is somebody else's conversation.
  if (!addressedToUs(event.data, config.EMAIL_REPLY_TO)) {
    console.info({ event: "email_recipient_not_ours", emailId: event.data.email_id });
    return { kind: "ignored" };
  }

  // Only now, once the delivery is trusted, is the body worth fetching.
  const content = await fetchReceivedEmail(config.RESEND_API_KEY, event.data.email_id);

  // A machine answering (an out-of-office, a ticketing auto-acknowledger) must not be
  // answered back, or two machines will talk until somebody's budget runs out.
  if (content.autoSubmitted && content.autoSubmitted.trim().toLowerCase() !== "no") {
    console.info({ event: "email_auto_submitted_ignored", emailId: event.data.email_id });
    return { kind: "ignored" };
  }

  // The delivery is genuinely from Resend, but the sender it names may not be. No
  // verdict at all fails closed: the sender's identity is the only gate on state.
  const sender = checkSenderAuthentication(content.authenticationResults, normaliseAddress(event.data.from));
  if (sender !== "pass") {
    console.warn({ event: "email_sender_unauthenticated", emailId: event.data.email_id, verdict: sender });
    return { kind: "unauthenticated_sender" };
  }

  const text = content.text ?? (content.html ? htmlToText(content.html) : "");

  return {
    kind: "ok",
    email: {
      // Resend's own id: stable across a redelivery, unlike a sender's Message-ID.
      messageId: event.data.email_id,
      from: event.data.from,
      subject: event.data.subject,
      body: text.slice(0, MAX_BODY_CHARS),
    },
  };
}

function addressedToUs(data: { to: string[]; cc: string[] }, own: string): boolean {
  const ours = normaliseAddress(own);
  if (!ours) return false;

  return [...data.to, ...data.cc].some((recipient) => normaliseAddress(recipient) === ours);
}

function readJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}
