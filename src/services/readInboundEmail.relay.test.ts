import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signInbound } from "@/guards/emailSignature";
import { signResend } from "@/guards/resendSignature";
import { readInboundEmail } from "@/services/readInboundEmail";

const WEBHOOK_SECRET = `whsec_${Buffer.from("resend-test-secret").toString("base64")}`;
const OWN_SECRET = "own-relay-secret";
const API_KEY = "re_test_key";

const config = {
  EMAIL_PROVIDER: "resend",
  EMAIL_INBOUND_SECRET: OWN_SECRET,
  RESEND_API_KEY: API_KEY,
  RESEND_WEBHOOK_SECRET: WEBHOOK_SECRET,
  EMAIL_REPLY_TO: "Frontdoor <intake@example.com>",
};

vi.mock("@/config", () => ({ getConfig: () => config }));

function resendHeaders(body: string, id = "msg_1"): Headers {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return new Headers({
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${signResend(body, id, timestamp, WEBHOOK_SECRET)}`,
  });
}

function received(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "email.received",
    data: {
      email_id: "abc-123",
      from: "procurement@example.com",
      to: ["intake@example.com"],
      subject: "Re: [PI-1] Purchase request",
      ...over,
    },
  });
}


beforeEach(() => {
  config.EMAIL_PROVIDER = "resend";
  config.RESEND_API_KEY = API_KEY;
  config.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET;
  config.EMAIL_INBOUND_SECRET = OWN_SECRET;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("readInboundEmail with our own relay", () => {
  function ownHeaders(body: string): Headers {
    const timestamp = String(Math.floor(Date.now() / 1000));
    return new Headers({
      "x-frontdoor-timestamp": timestamp,
      "x-frontdoor-signature": signInbound(body, timestamp, OWN_SECRET),
    });
  }

  beforeEach(() => {
    config.EMAIL_PROVIDER = "fake";
  });

  it("reads a signed delivery", async () => {
    const body = JSON.stringify({
      messageId: "m-1",
      from: "procurement@example.com",
      subject: "Re: [PI-1]",
      body: "approved",
    });

    expect(await readInboundEmail(body, ownHeaders(body))).toEqual({
      kind: "ok",
      email: {
        messageId: "m-1",
        from: "procurement@example.com",
        subject: "Re: [PI-1]",
        body: "approved",
      },
    });
  });

  it("refuses a forged signature", async () => {
    const body = JSON.stringify({
      messageId: "m-1",
      from: "a@b.com",
      subject: "s",
      body: "approved",
    });
    const headers = ownHeaders(body);
    headers.set("x-frontdoor-signature", "e1=forged");

    expect(await readInboundEmail(body, headers)).toEqual({
      kind: "unauthorised",
    });
  });

  it("does not accept a Resend signature on the endpoint", async () => {
    const body = received();

    expect(await readInboundEmail(body, resendHeaders(body))).toEqual({
      kind: "unauthorised",
    });
  });
});
