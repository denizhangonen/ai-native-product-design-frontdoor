import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ResendApiError,
  createResendProvider,
  fetchReceivedEmail,
} from "@/integrations/email/providers/resend";

const KEY = "re_test_key";

function respond(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const email = {
  to: "procurement@example.com",
  from: "Frontdoor <intake@example.com>",
  replyTo: "approvals@example.com",
  subject: "[PI-1] Purchase request",
  reference: "PI-1",
  text: "body",
};

describe("createResendProvider", () => {
  it("sends with the fields Resend expects", async () => {
    const fetchMock = respond({ id: "email-1" });
    vi.stubGlobal("fetch", fetchMock);

    await createResendProvider(KEY).send(email);

    const [url, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(init.body)).toEqual({
      from: email.from,
      to: email.to,
      reply_to: email.replyTo,
      subject: email.subject,
      text: email.text,
    });
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
  });

  it("passes an idempotency key so a retried send is one email", async () => {
    const fetchMock = respond({ id: "email-1" });
    vi.stubGlobal("fetch", fetchMock);

    await createResendProvider(KEY).send({
      ...email,
      idempotencyKey: "brief:PI-1:procurement",
    });

    const [, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers["Idempotency-Key"]).toBe("brief:PI-1:procurement");
  });

  it("sends no idempotency header when there is no key", async () => {
    const fetchMock = respond({ id: "email-1" });
    vi.stubGlobal("fetch", fetchMock);

    await createResendProvider(KEY).send(email);

    const [, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers["Idempotency-Key"]).toBeUndefined();
  });

  it("throws without echoing the error body, which can carry purchase detail", async () => {
    vi.stubGlobal("fetch", respond({ name: "validation_error", message: "Meridian Supply RFP-2041" }, 422));

    const failure = createResendProvider(KEY).send(email);

    await expect(failure).rejects.toBeInstanceOf(ResendApiError);
    await expect(failure).rejects.toThrow("422 validation_error");
    await expect(failure).rejects.not.toThrow(/Meridian/);
  });
});

describe("fetchReceivedEmail", () => {
  it("reads the body of a received email", async () => {
    const fetchMock = respond({
      text: "approved",
      html: "<p>approved</p>",
      headers: { "Authentication-Results": "amazonses.com; spf=pass; dkim=pass" },
    });
    vi.stubGlobal("fetch", fetchMock);

    const received = await fetchReceivedEmail(KEY, "abc-123");

    expect(received).toEqual({
      text: "approved",
      html: "<p>approved</p>",
      authenticationResults: "amazonses.com; spf=pass; dkim=pass",
      autoSubmitted: null,
    });
    expect((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(
      "https://api.resend.com/emails/receiving/abc-123",
    );
  });

  it("reports missing parts as null rather than undefined", async () => {
    vi.stubGlobal("fetch", respond({}));

    expect(await fetchReceivedEmail(KEY, "abc-123")).toEqual({
      text: null,
      html: null,
      authenticationResults: null,
      autoSubmitted: null,
    });
  });

  it("finds the authentication header whatever its casing", async () => {
    vi.stubGlobal("fetch", respond({ headers: { "authentication-results": "spf=pass" } }));

    expect((await fetchReceivedEmail(KEY, "abc-123")).authenticationResults).toBe("spf=pass");
  });
});
