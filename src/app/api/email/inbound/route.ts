import { describeError } from "@/domain/errors";
import { clientKey, isRateLimited } from "@/guards/rateLimit";
import { handleEmailReply } from "@/services/handleEmailReply";
import { readInboundEmail } from "@/services/readInboundEmail";

// A mail provider delivers each reply once or twice; anything near this is not mail.
const RATE_LIMIT = { limit: 120, windowMs: 60_000 };

export const maxDuration = 60;

export async function POST(request: Request) {
  if (isRateLimited(clientKey(request), RATE_LIMIT)) {
    console.warn({ event: "email_rate_limited" });
    return Response.json({ ok: false }, { status: 429 });
  }

  const read = await readInboundEmail(await request.text(), request.headers);

  switch (read.kind) {
    case "not_configured":
      return Response.json({ ok: false }, { status: 503 });
    case "unauthorised":
      console.warn({ event: "email_signature_rejected" });
      return Response.json({ ok: false }, { status: 401 });
    case "malformed":
      return Response.json({ ok: false }, { status: 400 });
    case "unauthenticated_sender":
      return Response.json({ ok: true, result: "unauthenticated_sender" });
    case "ignored":
      return Response.json({ ok: true, result: "ignored" });
    case "ok":
      break;
  }

  try {
    const result = await handleEmailReply(read.email);
    console.info({ event: "email_reply_handled", result });
    // Another attempt still holds this reply. Not done, so the provider must try again later.
    if (result === "in_flight") return Response.json({ ok: false, result }, { status: 503 });
    return Response.json({ ok: true, result });
  } catch (error) {
    console.error({ event: "email_reply_failed", ...describeError(error) });
    return Response.json({ ok: false }, { status: 500 });
  }
}
