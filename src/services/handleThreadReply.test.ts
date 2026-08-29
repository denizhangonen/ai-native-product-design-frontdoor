import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SlackConfig } from "@/config";
import { InvalidTransition, ModelUnavailable } from "@/domain/errors";
import type { ThreadReply } from "@/integrations/slack/events";
import { handleThreadReply } from "@/services/handleThreadReply";
import { stubRequest } from "@/services/testSupport";

const mocks = vi.hoisted(() => ({
  findThreadOrigin: vi.fn(),
  markInboundMessageProcessed: vi.fn(),
  getRequest: vi.fn(),
  postMessage: vi.fn(),
  parseRequest: vi.fn(),
  completeRequest: vi.fn(),
  askAgain: vi.fn(),
}));

vi.mock("@/config", () => ({
  getConfig: () => ({ POLICY_URL: "https://example.com/policy", PROCUREMENT_EMAILS: [] }),
}));
vi.mock("@/data/inboundMessages", () => ({
  findThreadOrigin: mocks.findThreadOrigin,
  markInboundMessageProcessed: mocks.markInboundMessageProcessed,
}));
vi.mock("@/data/requests", () => ({ getRequest: mocks.getRequest }));
vi.mock("@/integrations/slack/client", () => ({ postMessage: mocks.postMessage }));
vi.mock("@/ai/parseRequest", () => ({ parseRequest: mocks.parseRequest }));
// The brief and the trail have their own tests; here they must neither send nor connect.
vi.mock("@/integrations/email/send", () => ({ sendBrief: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/data/db", () => ({ db: () => ({ begin: vi.fn() }) }));
vi.mock("@/services/completeRequest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/completeRequest")>()),
  completeRequest: mocks.completeRequest,
}));
vi.mock("@/services/holdForDetail", () => ({ askAgain: mocks.askAgain }));

const SLACK: SlackConfig = { signingSecret: "s", botToken: "xoxb-not-a-real-token", channelId: "C1" };

const ORIGIN = "Need Figma for the design team, 5 seats";

const REPLY: ThreadReply = {
  eventId: "Ev124",
  channelId: "C1",
  slackUserId: "U123",
  messageTs: "1699999999.000200",
  threadTs: "1699999999.000100",
  text: "about $3k a year",
};

const EXTRACTION = {
  item: "Figma",
  quantity: 5,
  unit: "seats",
  amount: 3000,
  period: "annual",
  currency: "USD",
  team: "Design",
  urgency: null,
  reason: null,
  rationale: "The follow-up gave the yearly figure.",
  confidence: 0.9,
};

function lastReply(): string {
  const calls = mocks.postMessage.mock.calls;
  return calls[calls.length - 1][0].text as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  mocks.findThreadOrigin.mockResolvedValue({ kind: "request", requestId: "req-1", text: ORIGIN });
  mocks.getRequest.mockResolvedValue(stubRequest({ status: "needs_detail", budget: null }));
  mocks.markInboundMessageProcessed.mockResolvedValue(undefined);
  mocks.postMessage.mockResolvedValue(undefined);
  mocks.askAgain.mockResolvedValue("asked");
  mocks.parseRequest.mockResolvedValue({ kind: "parsed", model: "fake", extraction: EXTRACTION });
  mocks.completeRequest.mockResolvedValue({
    request: stubRequest({ status: "with_procurement" }),
    policy: { route: "procurement", reason: "above the threshold", flags: [] },
  });
});

describe("handleThreadReply", () => {
  it("reads the follow-up together with the opening message and completes the request", async () => {
    const result = await handleThreadReply(REPLY, SLACK);

    expect(result).toBe("completed");
    expect(mocks.parseRequest).toHaveBeenCalledWith(`${ORIGIN}\n\nFollow-up: about $3k a year`);
    expect(mocks.completeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-1",
        budget: { amountCents: 300_000, period: "annual", currency: "USD" },
        amountInMessage: true,
        reading: { confidence: 0.9, rationale: "The follow-up gave the yearly figure.", model: "fake" },
      }),
    );
  });

  it("answers in the original thread, not in a new one", async () => {
    await handleThreadReply(REPLY, SLACK);

    expect(mocks.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ threadTs: "1699999999.000100" }),
    );
    expect(lastReply()).toContain("Understood: Figma, 5 seats, $3,000/year");
  });

  it("caps each half on its own, so a long opening message cannot hide the follow-up", async () => {
    mocks.findThreadOrigin.mockResolvedValue({ kind: "request", requestId: "req-1", text: "x".repeat(5_000) });

    await handleThreadReply(REPLY, SLACK);

    const [sent] = mocks.parseRequest.mock.calls[0];
    expect(sent).toHaveLength(1_200 + "\n\nFollow-up: ".length + "about $3k a year".length);
    expect(sent.endsWith("about $3k a year")).toBe(true);
  });

  it("ignores a thread that is not one of ours", async () => {
    mocks.findThreadOrigin.mockResolvedValue({ kind: "not_ours" });

    expect(await handleThreadReply(REPLY, SLACK)).toBe("thread_ignored");
    expect(mocks.parseRequest).not.toHaveBeenCalled();
    expect(mocks.postMessage).not.toHaveBeenCalled();
    expect(mocks.markInboundMessageProcessed).toHaveBeenCalledWith("Ev124");
  });

  it("asks the person to wait when the opening message is still being read", async () => {
    mocks.findThreadOrigin.mockResolvedValue({ kind: "in_flight" });

    expect(await handleThreadReply(REPLY, SLACK)).toBe("thread_in_flight");
    expect(lastReply()).toContain("still reading your first message");
    expect(mocks.parseRequest).not.toHaveBeenCalled();
  });

  it("ignores a reply from someone other than the requester, silently", async () => {
    expect(await handleThreadReply({ ...REPLY, slackUserId: "U999" }, SLACK)).toBe("thread_ignored");
    expect(mocks.parseRequest).not.toHaveBeenCalled();
    expect(mocks.postMessage).not.toHaveBeenCalled();
  });

  it.each(["with_procurement", "guided", "event_created", "rejected"] as const)(
    "ignores a reply on a request that is already %s",
    async (status) => {
      mocks.getRequest.mockResolvedValue(stubRequest({ status }));

      expect(await handleThreadReply(REPLY, SLACK)).toBe("thread_ignored");
      expect(mocks.completeRequest).not.toHaveBeenCalled();
    },
  );

  it("decides what is still missing from the stored request, not from the model alone", async () => {
    // The model dropped the item on the re-read; the request already has it.
    mocks.parseRequest.mockResolvedValue({
      kind: "incomplete",
      model: "fake",
      extraction: { ...EXTRACTION, item: null },
      missing: ["item"],
    });

    expect(await handleThreadReply(REPLY, SLACK)).toBe("completed");
    expect(mocks.completeRequest).toHaveBeenCalledWith(expect.objectContaining({ item: null }));
  });

  it("asks once more when the follow-up still leaves the budget missing", async () => {
    mocks.parseRequest.mockResolvedValue({
      kind: "incomplete",
      model: "fake",
      extraction: { ...EXTRACTION, amount: null },
      missing: ["budget"],
    });

    expect(await handleThreadReply(REPLY, SLACK)).toBe("asked_again");
    expect(mocks.askAgain).toHaveBeenCalledWith("req-1", ["budget"]);
    expect(lastReply()).toContain("roughly what it costs");
    expect(mocks.completeRequest).not.toHaveBeenCalled();
  });

  it("names only what the request still lacks when the follow-up could not be read", async () => {
    mocks.parseRequest.mockResolvedValue({ kind: "unreadable", reason: "whatever" });

    await handleThreadReply(REPLY, SLACK);

    expect(mocks.askAgain).toHaveBeenCalledWith("req-1", ["budget"]);
  });

  it("tells the person to start fresh once the asks are used up", async () => {
    mocks.askAgain.mockResolvedValue("exhausted");
    mocks.parseRequest.mockResolvedValue({ kind: "unreadable", reason: "whatever" });

    expect(await handleThreadReply(REPLY, SLACK)).toBe("gave_up");
    expect(lastReply()).toContain("post a fresh request");
  });

  it("treats a second quick reply as conversation once the first completed the request", async () => {
    mocks.completeRequest.mockRejectedValue(new InvalidTransition("with_procurement", "routed"));

    expect(await handleThreadReply(REPLY, SLACK)).toBe("thread_ignored");
    expect(mocks.postMessage).not.toHaveBeenCalled();
    expect(mocks.markInboundMessageProcessed).toHaveBeenCalledWith("Ev124");
  });

  it("throws on a model outage so the delivery stays unhandled and no ask is burnt", async () => {
    mocks.parseRequest.mockResolvedValue({ kind: "failed", reason: "model timed out" });

    await expect(handleThreadReply(REPLY, SLACK)).rejects.toThrow(ModelUnavailable);
    expect(mocks.askAgain).not.toHaveBeenCalled();
    expect(mocks.markInboundMessageProcessed).not.toHaveBeenCalled();
  });

  it("leaves the delivery unhandled when completing the request fails", async () => {
    mocks.completeRequest.mockRejectedValue(new Error("database unreachable"));

    await expect(handleThreadReply(REPLY, SLACK)).rejects.toThrow("database unreachable");
    expect(mocks.markInboundMessageProcessed).not.toHaveBeenCalled();
  });
});
