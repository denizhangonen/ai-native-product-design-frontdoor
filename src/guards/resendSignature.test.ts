import { describe, expect, it } from "vitest";
import { signResend, verifyResendSignature } from "@/guards/resendSignature";

const SECRET = `whsec_${Buffer.from("a-signing-secret-for-tests").toString("base64")}`;
const NOW = 1_800_000_000;
const ID = "msg_2abc";
const BODY = '{"type":"email.received"}';

function header(body = BODY, id = ID, timestamp = String(NOW)): string {
  return `v1,${signResend(body, id, timestamp, SECRET)}`;
}

function verify(over: Partial<Parameters<typeof verifyResendSignature>[0]> = {}) {
  return verifyResendSignature({
    body: BODY,
    id: ID,
    timestamp: String(NOW),
    signature: header(),
    secret: SECRET,
    nowSeconds: NOW,
    ...over,
  });
}

describe("verifyResendSignature", () => {
  it("accepts a genuine delivery", () => {
    expect(verify()).toBe(true);
  });

  it("accepts a secret sent without the whsec prefix", () => {
    const bare = SECRET.slice("whsec_".length);
    const signature = `v1,${signResend(BODY, ID, String(NOW), bare)}`;
    expect(verify({ secret: bare, signature })).toBe(true);
  });

  it("accepts when one of several signatures matches, as during a key rotation", () => {
    expect(verify({ signature: `v1,c29tZXRoaW5nZWxzZQ== ${header()}` })).toBe(true);
  });

  it.each([
    ["a changed body", { body: '{"type":"email.received","extra":1}' }],
    ["a changed id", { id: "msg_other" }],
    ["a changed timestamp", { timestamp: String(NOW + 1) }],
    ["a different secret", { secret: "whsec_b3RoZXI=" }],
    ["a missing signature", { signature: null }],
    ["a missing id", { id: null }],
    ["a missing timestamp", { timestamp: null }],
    ["a timestamp that is not a number", { timestamp: "yesterday" }],
    ["an unknown version", { signature: `v2,${signResend(BODY, ID, String(NOW), SECRET)}` }],
    ["a signature with no version", { signature: signResend(BODY, ID, String(NOW), SECRET) }],
    ["an empty signature value", { signature: "v1," }],
  ])("refuses %s", (_label, over) => {
    expect(verify(over)).toBe(false);
  });

  it("refuses a delivery captured more than five minutes ago", () => {
    expect(verify({ nowSeconds: NOW + 301 })).toBe(false);
    expect(verify({ nowSeconds: NOW + 299 })).toBe(true);
  });
});
