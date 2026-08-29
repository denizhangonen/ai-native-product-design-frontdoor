import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SlackConfig } from "@/config";
import type { SlackMessage } from "@/integrations/slack/events";
import { ModelUnavailable } from "@/domain/errors";
import { handleSlackMessage } from "@/services/handleSlackMessage";
import { stubRequest } from "@/services/testSupport";

const mocks = vi.hoisted(() => ({
  recordInboundMessage: vi.fn(),
  markInboundMessageProcessed: vi.fn(),
  releaseInboundMessage: vi.fn(),
  linkRequest: vi.fn(),
  findLinkedRequest: vi.fn(),
  postMessage: vi.fn(),
  getUserName: vi.fn(),
  parseRequest: vi.fn(),
  submitRequest: vi.fn(),
  holdForDetail: vi.fn(),
  handleThreadReply: vi.fn(),
}));

vi.mock("@/config", () => ({
  getConfig: () => ({ POLICY_URL: "https://example.com/policy" }),
}));
vi.mock("@/data/inboundMessages", () => ({
  recordInboundMessage: mocks.recordInboundMessage,
  markInboundMessageProcessed: mocks.markInboundMessageProcessed,
  releaseInboundMessage: mocks.releaseInboundMessage,
  linkRequest: mocks.linkRequest,
  findLinkedRequest: mocks.findLinkedRequest,
}));
vi.mock("@/integrations/slack/client", () => ({
  postMessage: mocks.postMessage,
  getUserName: mocks.getUserName,
}));
vi.mock("@/ai/parseRequest", () => ({ parseRequest: mocks.parseRequest }));
// The brief and the trail have their own tests; here they must neither send nor connect.
vi.mock("@/integrations/email/send", () => ({ sendBrief: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/data/db", () => ({ db: () => ({ begin: vi.fn() }) }));
vi.mock("@/services/submitRequest", () => ({ submitRequest: mocks.submitRequest }));
vi.mock("@/services/holdForDetail", () => ({ holdForDetail: mocks.holdForDetail }));
vi.mock("@/services/handleThreadReply", () => ({ handleThreadReply: mocks.handleThreadReply }));

const SLACK: SlackConfig = {
  signingSecret: "secret",
  botToken: "xoxb-not-a-real-token",
  channelId: "C_PURCHASING",
};

const MESSAGE: SlackMessage = {
  eventId: "Ev123",
  channelId: "C_PURCHASING",
  slackUserId: "U123",
  messageTs: "1699999999.000100",
  threadTs: null,
  text: "Need Figma for the design team, 5 seats, about $3k/year, sometime this month",
};

const EXTRACTION = {
  item: "Figma",
  quantity: 5,
  unit: "seats",
  amount: 3000,
  period: "annual",
  currency: "USD",
  team: "Design",
  urgency: "this_month",
  reason: null,
  rationale: "Read plainly.",
  confidence: 0.95,
};

const PROCUREMENT = {
  route: "procurement",
  reason: "$3,000/year is above the $1,000/year threshold, so procurement must approve",
  flags: [],
};


beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordInboundMessage.mockResolvedValue("new");
  mocks.markInboundMessageProcessed.mockResolvedValue(undefined);
  mocks.releaseInboundMessage.mockResolvedValue(undefined);
  mocks.linkRequest.mockResolvedValue(undefined);
  mocks.postMessage.mockResolvedValue(undefined);
  mocks.getUserName.mockResolvedValue("Requester");
  mocks.submitRequest.mockResolvedValue({
    request: stubRequest({ status: "with_procurement" }),
    policy: PROCUREMENT,
  });
  mocks.holdForDetail.mockResolvedValue(stubRequest({ status: "needs_detail", budget: null }));
  mocks.parseRequest.mockResolvedValue({ kind: "parsed", model: "fake", extraction: EXTRACTION });
});

describe("handleSlackMessage, deliveries and retries", () => {
  it("keeps a held request held when the question cannot be posted", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.parseRequest.mockResolvedValue({
      kind: "incomplete",
      model: "fake",
      extraction: { ...EXTRACTION, amount: null, confidence: 0.7 },
      missing: ["budget"],
    });
    mocks.postMessage.mockRejectedValue(new Error("invalid_auth"));

    expect(await handleSlackMessage(MESSAGE, SLACK)).toBe("held");
    expect(mocks.markInboundMessageProcessed).toHaveBeenCalledWith("Ev123");
  });

  it("throws on a model outage so the delivery stays unhandled and the person is not blamed", async () => {
    mocks.parseRequest.mockResolvedValue({ kind: "failed", reason: "model timed out" });

    await expect(handleSlackMessage(MESSAGE, SLACK)).rejects.toThrow(ModelUnavailable);
    expect(mocks.markInboundMessageProcessed).not.toHaveBeenCalled();
    expect(mocks.postMessage).not.toHaveBeenCalled();
  });

  it("hands a thread reply to the thread handler, after the delivery is claimed", async () => {
    mocks.handleThreadReply.mockResolvedValue("completed");
    const reply = { ...MESSAGE, eventId: "Ev124", messageTs: "2.2", threadTs: "1.1", text: "$3k a year" };

    expect(await handleSlackMessage(reply, SLACK)).toBe("completed");
    expect(mocks.recordInboundMessage).toHaveBeenCalledWith(reply);
    expect(mocks.handleThreadReply).toHaveBeenCalledWith(reply, SLACK);
    expect(mocks.parseRequest).not.toHaveBeenCalled();
  });

  it("does nothing at all when Slack redelivers the same event", async () => {
    mocks.recordInboundMessage.mockResolvedValue("duplicate");

    expect(await handleSlackMessage(MESSAGE, SLACK)).toBe("duplicate");
    expect(mocks.parseRequest).not.toHaveBeenCalled();
    expect(mocks.postMessage).not.toHaveBeenCalled();
  });

  it("marks the delivery handled as soon as the request exists", async () => {
    await handleSlackMessage(MESSAGE, SLACK);
    expect(mocks.markInboundMessageProcessed).toHaveBeenCalledWith("Ev123");
  });

  it("retries a delivery whose first attempt died before creating anything", async () => {
    mocks.recordInboundMessage.mockResolvedValue("retry");
    mocks.findLinkedRequest.mockResolvedValue(null);

    expect(await handleSlackMessage(MESSAGE, SLACK)).toBe("submitted");
    expect(mocks.findLinkedRequest).toHaveBeenCalledWith("Ev123");
    expect(mocks.submitRequest).toHaveBeenCalled();
  });

  it("does nothing when a redelivery arrives while the first attempt is still running", async () => {
    mocks.recordInboundMessage.mockResolvedValue("in_flight");

    expect(await handleSlackMessage(MESSAGE, SLACK)).toBe("in_flight");
    expect(mocks.submitRequest).not.toHaveBeenCalled();
    expect(mocks.markInboundMessageProcessed).not.toHaveBeenCalled();
  });

  it("does not create a second request when a dead attempt already created one", async () => {
    mocks.recordInboundMessage.mockResolvedValue("retry");
    mocks.findLinkedRequest.mockResolvedValue("req-1");

    expect(await handleSlackMessage(MESSAGE, SLACK)).toBe("duplicate");
    expect(mocks.submitRequest).not.toHaveBeenCalled();
    expect(mocks.markInboundMessageProcessed).toHaveBeenCalledWith("Ev123");
  });

  it("leaves the delivery unhandled when the request could not be created", async () => {
    mocks.submitRequest.mockRejectedValue(new Error("database unreachable"));

    await expect(handleSlackMessage(MESSAGE, SLACK)).rejects.toThrow("database unreachable");
    expect(mocks.markInboundMessageProcessed).not.toHaveBeenCalled();
    expect(mocks.releaseInboundMessage).toHaveBeenCalledWith("Ev123");
  });
});
