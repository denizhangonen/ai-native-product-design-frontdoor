import { maskAddress } from "@/integrations/email/mask";
import type { EmailProvider, OutboundEmail } from "@/integrations/email/provider";

const API = "https://api.resend.com";
const TIMEOUT_MS = 10_000;

export class ResendApiError extends Error {
  constructor(status: number, reason: string) {
    super(`Resend request failed: ${status} ${reason}`);
    this.name = "ResendApiError";
  }
}

async function call<T>(path: string, apiKey: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    // Name only: the error body can echo the message, which carries purchase detail.
    const body = (await response.json().catch(() => ({}))) as { name?: string };
    throw new ResendApiError(response.status, body.name ?? "unknown");
  }

  return (await response.json()) as T;
}

export function createResendProvider(apiKey: string): EmailProvider {
  return {
    name: "resend",
    async send(email: OutboundEmail): Promise<void> {
      // The key makes a retried send land as one email rather than two.
      const headers: Record<string, string> = {};
      if (email.idempotencyKey) headers["Idempotency-Key"] = email.idempotencyKey;
      const sent = await call<{ id: string }>("/emails", apiKey, {
        method: "POST",
        headers,
        body: JSON.stringify({
          from: email.from,
          to: email.to,
          reply_to: email.replyTo,
          subject: email.subject,
          text: email.text,
          headers: email.headers,
        }),
      });
      // Reference only: the subject carries the item, which a person typed.
      console.info({ event: "email_sent", to: maskAddress(email.to), reference: email.reference, id: sent.id });
    },
  };
}

export type ReceivedEmail = {
  text: string | null;
  html: string | null;
  /** The receiving server's SPF, DKIM and DMARC verdict, verbatim. */
  authenticationResults: string | null;
  /** RFC 3834: set by auto-responders. Anything but "no" is a machine talking. */
  autoSubmitted: string | null;
};

/** Headers arrive as an object keyed by name or as a list of {name, value}; read either. */
function headerOf(headers: unknown, wanted: string): string | null {
  if (!headers || typeof headers !== "object") return null;
  const entries: Array<[unknown, unknown]> = Array.isArray(headers)
    ? headers.map((h: { name?: unknown; value?: unknown }) => [h?.name, h?.value])
    : Object.entries(headers as Record<string, unknown>);
  for (const [name, value] of entries) {
    if (typeof name !== "string" || name.toLowerCase() !== wanted) continue;
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  return null;
}

/** Deliveries carry metadata only, so the body is fetched once the delivery is trusted. */
export async function fetchReceivedEmail(apiKey: string, emailId: string): Promise<ReceivedEmail> {
  const payload = await call<{
    text?: string | null;
    html?: string | null;
    headers?: unknown;
  }>(`/emails/receiving/${encodeURIComponent(emailId)}`, apiKey);

  return {
    text: payload.text ?? null,
    html: payload.html ?? null,
    authenticationResults: headerOf(payload.headers, "authentication-results"),
    autoSubmitted: headerOf(payload.headers, "auto-submitted"),
  };
}
