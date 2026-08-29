import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/slack/events/route";
import { clearRateLimits } from "@/guards/rateLimit";
import { sign } from "@/guards/slackSignature";

const mocks = vi.hoisted(() => ({
  getSlackConfig: vi.fn(),
  handleSlackMessage: vi.fn(),
  postMessage: vi.fn(),
  /** Work the route handed off to run after the response. */
  deferred: [] as Array<() => Promise<void>>,
}));

// Stands in for the platform: collect the work, then run it once the answer is sent.
vi.mock("next/server", () => ({
  after: (work: () => Promise<void>) => {
    mocks.deferred.push(work);
  },
}));

async function runDeferred(): Promise<void> {
  const pending = mocks.deferred.splice(0);
  for (const work of pending) await work();
}

vi.mock("@/config", () => ({ getSlackConfig: mocks.getSlackConfig }));
vi.mock("@/services/handleSlackMessage", () => ({
  handleSlackMessage: mocks.handleSlackMessage,
}));
vi.mock("@/integrations/slack/client", () => ({
  postMessage: mocks.postMessage,
}));

const SLACK = {
  signingSecret: "secret",
  botToken: "xoxb-not-a-real-token",
  channelId: "C1",
};

const MESSAGE = {
  type: "event_callback",
  event_id: "Ev1",
  event: {
    type: "message",
    channel: "C1",
    user: "U1",
    ts: "1.1",
    text: "Need Figma for the design team, 5 seats, about $3k/year",
  },
};

function post(payload: unknown, options: { signed?: boolean; ip?: string } = {}) {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": options.ip ?? "203.0.113.1",
    "x-slack-request-timestamp": timestamp,
    "x-slack-signature": options.signed === false ? "v0=bad" : sign(body, timestamp, "secret"),
  };
  return POST(
    new Request("https://example.com/api/slack/events", {
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
  mocks.deferred.length = 0;
  mocks.getSlackConfig.mockReturnValue(SLACK);
  mocks.handleSlackMessage.mockResolvedValue("submitted");
  mocks.postMessage.mockResolvedValue(undefined);
});

describe("POST /api/slack/events", () => {
  it("answers the verification challenge", async () => {
    const response = await post({ type: "url_verification", challenge: "abc" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ challenge: "abc" });
  });

  it("answers before doing the work, because Slack only waits three seconds", async () => {
    const response = await post(MESSAGE);

    expect(response.status).toBe(200);
    expect(mocks.handleSlackMessage).not.toHaveBeenCalled();
  });

  it("hands a signed message to the service", async () => {
    const response = await post(MESSAGE);
    await runDeferred();

    expect(response.status).toBe(200);
    expect(mocks.handleSlackMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "Ev1",
        text: "Need Figma for the design team, 5 seats, about $3k/year",
      }),
      SLACK,
    );
  });

  it("rejects a bad signature before doing any work", async () => {
    const response = await post(MESSAGE, { signed: false });
    await runDeferred();
    expect(response.status).toBe(401);
    expect(mocks.handleSlackMessage).not.toHaveBeenCalled();
  });

  it("refuses to run at all when Slack is not configured", async () => {
    mocks.getSlackConfig.mockReturnValue(null);
    expect((await post(MESSAGE)).status).toBe(503);
  });

  it("tells the person in the thread when the work fails", async () => {
    mocks.handleSlackMessage.mockRejectedValue(new Error("database unreachable"));

    const response = await post(MESSAGE);
    await runDeferred();

    expect(response.status).toBe(200);
    expect(mocks.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadTs: "1.1",
        text: expect.stringMatching(/say it again/i),
      }),
    );
  });

  it("still answers 200 when even the apology cannot be sent", async () => {
    mocks.handleSlackMessage.mockRejectedValue(new Error("database unreachable"));
    mocks.postMessage.mockRejectedValue(new Error("slack unreachable"));

    const response = await post(MESSAGE);
    await runDeferred();

    expect(response.status).toBe(200);
  });

  it("rate limits a caller that floods the endpoint", async () => {
    for (let i = 0; i < 120; i += 1) await post(MESSAGE, { ip: "198.51.100.7" });

    const response = await post(MESSAGE, { ip: "198.51.100.7" });
    await runDeferred();

    expect(response.status).toBe(429);
    expect(mocks.handleSlackMessage).toHaveBeenCalledTimes(120);
  });

  it("apologises inside the thread when a thread reply fails", async () => {
    mocks.handleSlackMessage.mockRejectedValue(new Error("database unreachable"));
    const reply = { ...MESSAGE, event: { ...MESSAGE.event, ts: "2.2", thread_ts: "1.1", text: "about $3k a year" } };

    await post(reply);
    await runDeferred();

    expect(mocks.postMessage).toHaveBeenCalledWith(expect.objectContaining({ threadTs: "1.1" }));
  });

  it("does not let one flooding caller block another", async () => {
    for (let i = 0; i < 121; i += 1) await post(MESSAGE, { ip: "198.51.100.7" });
    expect((await post(MESSAGE, { ip: "198.51.100.8" })).status).toBe(200);
  });
});
