import { describe, expect, it } from "vitest";
import { signInbound, verifyEmailSignature } from "@/guards/emailSignature";
import { sign as signSlack } from "@/guards/slackSignature";

const SECRET = "inbound-secret";
const NOW = 1_760_000_000;
const BODY = JSON.stringify({ messageId: "m1", from: "procurement@example.com" });

function signed(overrides: Partial<Parameters<typeof verifyEmailSignature>[0]> = {}) {
  const timestamp = String(NOW);
  return verifyEmailSignature({
    body: BODY,
    timestamp,
    signature: signInbound(BODY, timestamp, SECRET),
    secret: SECRET,
    nowSeconds: NOW,
    ...overrides,
  });
}

describe("verifyEmailSignature", () => {
  it("accepts a correctly signed delivery", () => {
    expect(signed()).toBe(true);
  });

  it("rejects a body changed after signing", () => {
    expect(signed({ body: BODY.replace("procurement", "attacker") })).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    const timestamp = String(NOW);
    expect(signed({ signature: signInbound(BODY, timestamp, "guessed-secret") })).toBe(false);
  });

  it("rejects a replay older than five minutes", () => {
    expect(signed({ nowSeconds: NOW + 5 * 60 + 1 })).toBe(false);
  });

  // Different version prefixes, so a signature for one endpoint cannot be replayed at the other.
  it("rejects a signature minted for the Slack endpoint", () => {
    const timestamp = String(NOW);
    expect(signed({ signature: signSlack(BODY, timestamp, SECRET) })).toBe(false);
  });

  it.each([
    ["a missing signature", { signature: null }],
    ["a missing timestamp", { timestamp: null }],
    ["a non-numeric timestamp", { timestamp: "soon" }],
    ["an empty signature", { signature: "" }],
  ])("rejects %s", (_label, overrides) => {
    expect(signed(overrides)).toBe(false);
  });
});
