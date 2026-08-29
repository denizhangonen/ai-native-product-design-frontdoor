import { signHmac, verifyHmac } from "@/guards/hmacSignature";

const VERSION = "v0";

export type SlackSignatureInput = {
  body: string;
  timestamp: string | null;
  signature: string | null;
  signingSecret: string;
  nowSeconds?: number;
};

export function sign(body: string, timestamp: string, signingSecret: string): string {
  return signHmac(body, timestamp, signingSecret, VERSION);
}

export function verifySlackSignature(input: SlackSignatureInput): boolean {
  return verifyHmac({
    body: input.body,
    timestamp: input.timestamp,
    signature: input.signature,
    secret: input.signingSecret,
    version: VERSION,
    nowSeconds: input.nowSeconds,
  });
}
