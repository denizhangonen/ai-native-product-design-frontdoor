import { signHmac, verifyHmac } from "@/guards/hmacSignature";

const VERSION = "e1";

export type EmailSignatureInput = {
  body: string;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  nowSeconds?: number;
};

export function signInbound(body: string, timestamp: string, secret: string): string {
  return signHmac(body, timestamp, secret, VERSION);
}

/**
 * Proves an inbound delivery came from our own mail relay. The scheme is ours
 * because the provider is not chosen yet; a real provider swaps this for its own
 * signature check, and nothing outside this file changes.
 */
export function verifyEmailSignature(input: EmailSignatureInput): boolean {
  return verifyHmac({
    body: input.body,
    timestamp: input.timestamp,
    signature: input.signature,
    secret: input.secret,
    version: VERSION,
    nowSeconds: input.nowSeconds,
  });
}
