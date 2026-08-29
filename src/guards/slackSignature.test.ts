import { describe, expect, it } from "vitest";
import { sign, verifySlackSignature } from "@/guards/slackSignature";

const SECRET = "test-signing-secret";
const NOW = 1_760_000_000;
const BODY = JSON.stringify({ type: "event_callback", event_id: "Ev1" });

function signed(overrides: Partial<Parameters<typeof verifySlackSignature>[0]> = {}) {
  const timestamp = String(NOW);
  return verifySlackSignature({
    body: BODY,
    timestamp,
    signature: sign(BODY, timestamp, SECRET),
    signingSecret: SECRET,
    nowSeconds: NOW,
    ...overrides,
  });
}

describe("verifySlackSignature", () => {
  it("accepts a correctly signed request", () => {
    expect(signed()).toBe(true);
  });

  it("uses the real clock when none is injected", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const ok = verifySlackSignature({
      body: BODY,
      timestamp,
      signature: sign(BODY, timestamp, SECRET),
      signingSecret: SECRET,
    });
    expect(ok).toBe(true);
  });

  it("rejects a body that was changed after signing", () => {
    expect(signed({ body: `${BODY} ` })).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    const timestamp = String(NOW);
    expect(signed({ signature: sign(BODY, timestamp, "someone-elses-secret") })).toBe(false);
  });

  it("rejects a replay older than five minutes", () => {
    expect(signed({ nowSeconds: NOW + 5 * 60 + 1 })).toBe(false);
  });

  it("accepts a request just inside the five minute window", () => {
    expect(signed({ nowSeconds: NOW + 5 * 60 })).toBe(true);
  });

  it("rejects a timestamp far in the future", () => {
    expect(signed({ nowSeconds: NOW - 5 * 60 - 1 })).toBe(false);
  });

  it.each([
    ["a missing signature", { signature: null }],
    ["a missing timestamp", { timestamp: null }],
    ["a non-numeric timestamp", { timestamp: "not-a-number" }],
    ["an empty signature", { signature: "" }],
    ["a truncated signature", { signature: "v0=abc" }],
  ])("rejects %s", (_label, overrides) => {
    expect(signed(overrides)).toBe(false);
  });
});
