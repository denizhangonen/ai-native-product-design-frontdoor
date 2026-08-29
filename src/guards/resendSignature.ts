import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_SECONDS = 5 * 60;
const VERSION = "v1";

export type ResendSignatureInput = {
  body: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  /** Seconds since the epoch. Injected so the replay window is testable. */
  nowSeconds?: number;
};

// The secret travels as `whsec_` plus base64; the bytes behind it are the key.
function keyOf(secret: string): Buffer {
  const encoded = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  return Buffer.from(encoded, "base64");
}

export function signResend(body: string, id: string, timestamp: string, secret: string): string {
  return createHmac("sha256", keyOf(secret)).update(`${id}.${timestamp}.${body}`).digest("base64");
}

/**
 * Proves a delivery came from Resend. Their webhooks follow the Svix scheme, so
 * the check is written out here rather than pulling in a library for one HMAC.
 */
export function verifyResendSignature(input: ResendSignatureInput): boolean {
  const { body, id, timestamp, signature, secret } = input;
  if (!id || !timestamp || !signature) return false;

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return false;

  // Replay protection: a captured delivery stops working after five minutes.
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - sentAt) > MAX_AGE_SECONDS) return false;

  const expected = Buffer.from(signResend(body, id, timestamp, secret));

  // The header carries one signature per key, so a rotation has both in flight.
  return signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== VERSION || !value) return false;
    const received = Buffer.from(value);
    return expected.length === received.length && timingSafeEqual(expected, received);
  });
}
