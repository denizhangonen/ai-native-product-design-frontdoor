import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SlackConfig } from "@/config";
import type { SlackMessage } from "@/integrations/slack/events";
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

function lastReply(): string {
  const calls = mocks.postMessage.mock.calls;
  return calls[calls.length - 1][0].text as string;
}

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

describe("handleSlackMessage", () => {
  it("turns an understood message into a request, in cents, with the reading", async () => {
    const result = await handleSlackMessage(MESSAGE, SLACK);

    expect(result).toBe("submitted");
    expect(mocks.submitRequest).toHaveBeenCalledWith({
      requester: { slackUserId: "U123", displayName: "Requester" },
      amountInMessage: true,
      item: "Figma",
      quantity: 5,
      unit: "seats",
      budget: { amountCents: 300_000, period: "annual", currency: "USD" },
      team: "Design",
      urgency: "this_month",
      reason: null,
      reading: { confidence: 0.95, rationale: "Read plainly.", model: "fake" },
    });
    expect(mocks.linkRequest).toHaveBeenCalledWith("Ev123", "req-1");
  });

  it("says back what it understood and where it went", async () => {
    await handleSlackMessage(MESSAGE, SLACK);

    const text = lastReply();
    expect(text).toContain("Understood: Figma, 5 seats, $3,000/year for the Design team");
    expect(text).toContain("Routing to procurement with a brief");
    expect(text).toContain("PI-1001");
  });

  it("gives the guided answer, with the policy link, when the rule says so", async () => {
    mocks.submitRequest.mockResolvedValue({
      request: stubRequest({ status: "guided" }),
      policy: { route: "guided", reason: "$600/year is within the $1,000/year threshold", flags: [] },
    });

    await handleSlackMessage(MESSAGE, SLACK);

    expect(lastReply()).toContain("use the team card");
    expect(lastReply()).toContain("https://example.com/policy");
  });

  it("parks an incomplete request and asks for the missing piece in the thread", async () => {
    mocks.parseRequest.mockResolvedValue({
      kind: "incomplete",
      model: "fake",
      extraction: { ...EXTRACTION, amount: null, confidence: 0.7 },
      missing: ["budget"],
    });

    const result = await handleSlackMessage(MESSAGE, SLACK);

    expect(result).toBe("held");
    expect(mocks.holdForDetail).toHaveBeenCalledWith(
      expect.objectContaining({ item: "Figma", budget: null, missing: ["budget"] }),
    );
    expect(mocks.linkRequest).toHaveBeenCalledWith("Ev123", "req-1");
    expect(mocks.submitRequest).not.toHaveBeenCalled();
    expect(lastReply()).toContain("roughly what it costs");
    expect(mocks.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ threadTs: MESSAGE.messageTs }),
    );
  });

  it("marks the figure as found in the message when it is, so the policy can trust it", async () => {
    await handleSlackMessage(MESSAGE, SLACK);
    expect(mocks.submitRequest).toHaveBeenCalledWith(expect.objectContaining({ amountInMessage: true }));
  });

  it("marks the figure as not found when the model read a number that is not there", async () => {
    await handleSlackMessage({ ...MESSAGE, text: "Need Figma for the design team, 5 seats" }, SLACK);
    expect(mocks.submitRequest).toHaveBeenCalledWith(expect.objectContaining({ amountInMessage: false }));
  });

  it("says so plainly when the message is not a purchase request, and stores nothing", async () => {
    mocks.parseRequest.mockResolvedValue({ kind: "unreadable", reason: "whatever" });

    const result = await handleSlackMessage(MESSAGE, SLACK);

    expect(result).toBe("not_understood");
    expect(lastReply()).toContain("could not read that as a purchase request");
    expect(mocks.submitRequest).not.toHaveBeenCalled();
    expect(mocks.holdForDetail).not.toHaveBeenCalled();
  });

  it("still creates the request when the name lookup fails", async () => {
    mocks.getUserName.mockRejectedValue(new Error("invalid_auth"));

    expect(await handleSlackMessage(MESSAGE, SLACK)).toBe("submitted");
    expect(mocks.submitRequest).toHaveBeenCalledWith(
      expect.objectContaining({ requester: { slackUserId: "U123", displayName: "U123" } }),
    );
  });

  it("drops a rationale that names the requester before it is stored", async () => {
    mocks.parseRequest.mockResolvedValue({
      kind: "parsed",
      model: "fake",
      extraction: { ...EXTRACTION, rationale: "Requester wants Figma for the design team." },
    });

    await handleSlackMessage(MESSAGE, SLACK);

    expect(mocks.submitRequest).toHaveBeenCalledWith(
      expect.objectContaining({ reading: expect.objectContaining({ rationale: null }) }),
    );
  });

  it("never asks the model to decide the route", async () => {
    await handleSlackMessage(MESSAGE, SLACK);
    const [submitted] = mocks.submitRequest.mock.calls[0];
    expect(Object.keys(submitted)).not.toContain("route");
    expect(Object.keys(submitted)).not.toContain("status");
  });
});
