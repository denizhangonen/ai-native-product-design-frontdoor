import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_SECONDS = 5 * 60;

export type HmacInput = {
  body: string;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  /** Version label, sent as the `<version>=<digest>` prefix. */
  version: string;
  /** Seconds since the epoch. Injected so the replay window is testable. */
  nowSeconds?: number;
};

export function signHmac(body: string, timestamp: string, secret: string, version: string): string {
  const digest = createHmac("sha256", secret)
    .update(`${version}:${timestamp}:${body}`)
    .digest("hex");
  return `${version}=${digest}`;
}

export function verifyHmac(input: HmacInput): boolean {
  const { body, timestamp, signature, secret, version } = input;
  if (!timestamp || !signature) return false;

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return false;

  // Replay protection: a captured request stops working after five minutes.
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - sentAt) > MAX_AGE_SECONDS) return false;

  const expected = Buffer.from(signHmac(body, timestamp, secret, version));
  const received = Buffer.from(signature);
  if (expected.length !== received.length) return false;

  return timingSafeEqual(expected, received);
}
