import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/email/inbound/route";
import { signInbound } from "@/guards/emailSignature";
import { clearRateLimits } from "@/guards/rateLimit";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  handleEmailReply: vi.fn(),
}));

vi.mock("@/config", () => ({ getConfig: mocks.getConfig }));
vi.mock("@/services/handleEmailReply", () => ({
  handleEmailReply: mocks.handleEmailReply,
}));

const EMAIL = {
  messageId: "m1",
  from: "procurement@example.com",
  subject: "Re: [PI-1042] Purchase request",
  body: "approved",
};

function post(payload: unknown, options: { signed?: boolean } = {}) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers = {
    "content-type": "application/json",
    "x-forwarded-for": "203.0.113.1",
    "x-frontdoor-timestamp": timestamp,
    "x-frontdoor-signature":
      options.signed === false ? "e1=bad" : signInbound(body, timestamp, "secret"),
  };
  return POST(
    new Request("https://example.com/api/email/inbound", {
      method: "POST",
      headers,
      body,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  clearRateLimits();
  mocks.getConfig.mockReturnValue({ EMAIL_INBOUND_SECRET: "secret" });
  mocks.handleEmailReply.mockResolvedValue("applied");
});

describe("POST /api/email/inbound", () => {
  it("hands a signed, well-formed reply to the service", async () => {
    const response = await post(EMAIL);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, result: "applied" });
    expect(mocks.handleEmailReply).toHaveBeenCalledWith(EMAIL);
  });

  it("answers 503 when another attempt still holds the reply, so the provider tries again", async () => {
    mocks.handleEmailReply.mockResolvedValue("in_flight");

    expect((await post(EMAIL)).status).toBe(503);
  });

  it("rejects a bad signature before doing any work", async () => {
    expect((await post(EMAIL, { signed: false })).status).toBe(401);
    expect(mocks.handleEmailReply).not.toHaveBeenCalled();
  });

  it("refuses to run when no inbound secret is configured", async () => {
    mocks.getConfig.mockReturnValue({ EMAIL_INBOUND_SECRET: undefined });
    expect((await post(EMAIL)).status).toBe(503);
  });

  it.each([
    ["a body that is not JSON", "not json"],
    ["a payload missing the sender", { ...EMAIL, from: undefined }],
    ["a payload with an empty message id", { ...EMAIL, messageId: "" }],
  ])("answers 400 to %s", async (_label, payload) => {
    expect((await post(payload)).status).toBe(400);
    expect(mocks.handleEmailReply).not.toHaveBeenCalled();
  });

  it("answers 500 without leaking detail when the service fails", async () => {
    mocks.handleEmailReply.mockRejectedValue(new Error("database unreachable at postgres://x"));

    const response = await post(EMAIL);

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("postgres://");
  });
});
