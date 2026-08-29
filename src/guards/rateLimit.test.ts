import { beforeEach, describe, expect, it } from "vitest";
import { clearRateLimits, clientKey, isRateLimited } from "@/guards/rateLimit";

const RULE = { limit: 3, windowMs: 60_000 };
const T0 = 1_000_000;

beforeEach(clearRateLimits);

describe("isRateLimited", () => {
  it("allows requests up to the limit inside one window", () => {
    expect(isRateLimited("a", RULE, T0)).toBe(false);
    expect(isRateLimited("a", RULE, T0 + 1)).toBe(false);
    expect(isRateLimited("a", RULE, T0 + 2)).toBe(false);
  });

  it("blocks the request after the limit", () => {
    for (let i = 0; i < 3; i += 1) isRateLimited("a", RULE, T0);
    expect(isRateLimited("a", RULE, T0 + 3)).toBe(true);
    expect(isRateLimited("a", RULE, T0 + 4)).toBe(true);
  });

  it("starts a fresh window once the old one has passed", () => {
    for (let i = 0; i < 4; i += 1) isRateLimited("a", RULE, T0);
    expect(isRateLimited("a", RULE, T0 + 60_000)).toBe(false);
  });

  it("keeps callers separate", () => {
    for (let i = 0; i < 4; i += 1) isRateLimited("a", RULE, T0);
    expect(isRateLimited("b", RULE, T0)).toBe(false);
  });
});

describe("clientKey", () => {
  function request(headers: Record<string, string>) {
    return new Request("https://example.com", { headers });
  }

  it("takes the first address in x-forwarded-for", () => {
    expect(clientKey(request({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip", () => {
    expect(clientKey(request({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("labels an unidentifiable caller rather than sharing a bucket silently", () => {
    expect(clientKey(request({}))).toBe("unknown");
  });
});
