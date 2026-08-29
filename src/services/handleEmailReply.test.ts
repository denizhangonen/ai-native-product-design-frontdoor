import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidTransition, ModelUnavailable } from "@/domain/errors";
import { MAX_ANSWERED_REPLIES } from "@/services/answerReply";
import { handleEmailReply } from "@/services/handleEmailReply";
import { stubRequest } from "@/services/testSupport";

const mocks = vi.hoisted(() => ({
  countRepliesFrom: vi.fn(),
  recordInboundEmail: vi.fn(),
  markInboundEmailProcessed: vi.fn(),
  releaseInboundEmail: vi.fn(),
  getRequestByReference: vi.fn(),
  parseDecision: vi.fn(),
  applyDecision: vi.fn(),
  sendClarification: vi.fn(),
  notifyRequester: vi.fn(),
}));

vi.mock("@/config", () => ({
  getConfig: () => ({ PROCUREMENT_EMAILS: ["procurement@example.com"] }),
}));
vi.mock("@/data/inboundEmails", () => ({
  countRepliesFrom: mocks.countRepliesFrom,
  recordInboundEmail: mocks.recordInboundEmail,
  markInboundEmailProcessed: mocks.markInboundEmailProcessed,
  releaseInboundEmail: mocks.releaseInboundEmail,
}));
vi.mock("@/data/requests", () => ({ getRequestByReference: mocks.getRequestByReference }));
vi.mock("@/ai/parseDecision", () => ({ parseDecision: mocks.parseDecision }));
vi.mock("@/services/applyDecision", () => ({ applyDecision: mocks.applyDecision }));
vi.mock("@/integrations/email/send", () => ({ sendClarification: mocks.sendClarification }));
vi.mock("@/services/notifyRequester", () => ({ notifyRequester: mocks.notifyRequester }));

const REQUEST = stubRequest({ status: "with_procurement", reference: "PI-1042" });

const EMAIL = {
  messageId: "msg-1",
  from: "Pat Buyer <procurement@example.com>",
  subject: "Re: [PI-1042] Purchase request: Figma, 5 seats, $3,000/year",
  body: "Approve but cap at 4 seats, the fifth can share.\n\nOn Wed, Aug 20, 2026 at 10:00 AM Frontdoor wrote:\n> ...",
};

function decided(reading: Record<string, unknown>) {
  mocks.parseDecision.mockResolvedValue({
    kind: "decided",
    model: "fake",
    reading: { decision: "approve", note: null, capQuantity: null, capAmount: null, capPeriod: null, confidence: 0.95, ...reading },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.countRepliesFrom.mockResolvedValue(1);
  mocks.recordInboundEmail.mockResolvedValue("new");
  mocks.markInboundEmailProcessed.mockResolvedValue(undefined);
  mocks.releaseInboundEmail.mockResolvedValue(undefined);
  mocks.getRequestByReference.mockResolvedValue(REQUEST);
  mocks.applyDecision.mockResolvedValue({
    request: { ...REQUEST, status: "event_created" },
    event: { id: "ev-1" },
    changed: true,
  });
  mocks.notifyRequester.mockResolvedValue("notified");
  mocks.sendClarification.mockResolvedValue(undefined);
  decided({ note: "the fifth can share", capQuantity: 4 });
});

describe("handleEmailReply", () => {
  it("applies an approval with a cap, in cents, with the reading on the trail", async () => {
    expect(await handleEmailReply(EMAIL)).toBe("applied");

    expect(mocks.applyDecision).toHaveBeenCalledWith({
      requestId: "req-1",
      decision: "approve",
      actor: "procurement@example.com",
      note: "the fifth can share",
      cap: { quantity: 4, annualCents: null },
      reading: { confidence: 0.95, model: "fake" },
    });
  });

  it("turns a dollar cap into cents by the year, in code", async () => {
    decided({ capAmount: 2000.5, capPeriod: "annual" });
    await handleEmailReply(EMAIL);
    expect(mocks.applyDecision).toHaveBeenCalledWith(
      expect.objectContaining({ cap: { quantity: null, annualCents: 200_050 } }),
    );
  });

  it("multiplies a monthly limit by twelve before comparing it", async () => {
    decided({ capAmount: 200, capPeriod: "monthly" });
    await handleEmailReply(EMAIL);
    expect(mocks.applyDecision).toHaveBeenCalledWith(
      expect.objectContaining({ cap: { quantity: null, annualCents: 240_000 } }),
    );
  });

  it("tells the requester in their thread once the decision is applied", async () => {
    await handleEmailReply(EMAIL);

    expect(mocks.notifyRequester).toHaveBeenCalledWith(
      expect.objectContaining({ status: "event_created" }),
      "the fifth can share",
    );
  });

  it("reports a replay of the same decision as already decided, and does not notify again", async () => {
    mocks.applyDecision.mockResolvedValue({ request: REQUEST, event: null, changed: false });

    expect(await handleEmailReply(EMAIL)).toBe("already_decided");
    expect(mocks.notifyRequester).not.toHaveBeenCalled();
  });

  it("reads only what was typed, not the quoted original", async () => {
    await handleEmailReply(EMAIL);
    expect(mocks.parseDecision).toHaveBeenCalledWith("Approve but cap at 4 seats, the fifth can share.");
  });

  it("passes a rejection through without any cap", async () => {
    decided({ decision: "reject", note: "we already have a licence", capQuantity: 2 });

    await handleEmailReply(EMAIL);

    expect(mocks.applyDecision).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "reject", cap: null, note: "we already have a licence" }),
    );
  });

  it.each([
    ["above what was asked", { capQuantity: 6 }],
    ["below one", { capQuantity: 0 }],
    ["above the yearly figure", { capAmount: 3001, capPeriod: "annual" }],
    ["above the yearly figure once a monthly limit is annualised", { capAmount: 251, capPeriod: "monthly" }],
  ])("asks again instead of acting on a cap %s", async (_label, reading) => {
    decided(reading);

    expect(await handleEmailReply(EMAIL)).toBe("unclear");
    expect(mocks.applyDecision).not.toHaveBeenCalled();
    expect(mocks.sendClarification).toHaveBeenCalledWith(REQUEST, "procurement@example.com", "msg-1", "cap");
    expect(mocks.markInboundEmailProcessed).toHaveBeenCalledWith("msg-1");
  });

  it("asks again on a seat cap for a request that never had a quantity", async () => {
    mocks.getRequestByReference.mockResolvedValue(stubRequest({ status: "with_procurement", quantity: null, unit: null }));
    decided({ capQuantity: 2 });

    expect(await handleEmailReply(EMAIL)).toBe("unclear");
  });

  it("ignores a reply from someone who is not procurement, before anything is stored or read", async () => {
    expect(await handleEmailReply({ ...EMAIL, from: "requester@example.com" })).toBe("not_procurement");

    expect(mocks.recordInboundEmail).not.toHaveBeenCalled();
    expect(mocks.getRequestByReference).not.toHaveBeenCalled();
    expect(mocks.parseDecision).not.toHaveBeenCalled();
  });

  it("refuses a display name that impersonates procurement", async () => {
    expect(await handleEmailReply({ ...EMAIL, from: "procurement@example.com <attacker@evil.com>" })).toBe("not_procurement");
  });

  it("asks for a plain answer when the reply is unclear, changing nothing", async () => {
    mocks.parseDecision.mockResolvedValue({ kind: "unclear", reason: "reply was not a decision" });

    expect(await handleEmailReply(EMAIL)).toBe("unclear");
    expect(mocks.applyDecision).not.toHaveBeenCalled();
    expect(mocks.sendClarification).toHaveBeenCalledWith(REQUEST, "procurement@example.com", "msg-1", "unclear");
  });

  it("goes quiet once one sender has been answered enough times about one request", async () => {
    mocks.countRepliesFrom.mockResolvedValue(MAX_ANSWERED_REPLIES + 1);
    mocks.parseDecision.mockResolvedValue({ kind: "unclear", reason: "reply was not a decision" });

    expect(await handleEmailReply(EMAIL)).toBe("unclear");
    expect(mocks.sendClarification).not.toHaveBeenCalled();
    expect(mocks.countRepliesFrom).toHaveBeenCalledWith("procurement@example.com", "PI-1042");
  });

  it("throws on a model outage, gives the claim back, and leaves the reply unhandled", async () => {
    mocks.parseDecision.mockResolvedValue({ kind: "failed", reason: "model timed out" });

    await expect(handleEmailReply(EMAIL)).rejects.toThrow(ModelUnavailable);
    expect(mocks.sendClarification).not.toHaveBeenCalled();
    expect(mocks.markInboundEmailProcessed).not.toHaveBeenCalled();
    expect(mocks.releaseInboundEmail).toHaveBeenCalledWith("msg-1");
  });

  it("does nothing when the same message arrives twice", async () => {
    mocks.recordInboundEmail.mockResolvedValue("duplicate");

    expect(await handleEmailReply(EMAIL)).toBe("duplicate");
    expect(mocks.parseDecision).not.toHaveBeenCalled();
  });

  it("does nothing when a redelivery arrives while the first attempt is still running", async () => {
    mocks.recordInboundEmail.mockResolvedValue("in_flight");

    expect(await handleEmailReply(EMAIL)).toBe("in_flight");
    expect(mocks.markInboundEmailProcessed).not.toHaveBeenCalled();
  });

  it.each([
    ["no reference in the subject", { subject: "Re: your message" }],
    ["a reference for a request that does not exist", { subject: "Re: [PI-9999] whatever" }],
  ])("reports %s and tells the sender, without reading the reply", async (_label, overrides) => {
    mocks.getRequestByReference.mockResolvedValue(null);

    expect(await handleEmailReply({ ...EMAIL, ...overrides })).toBe("unknown_reference");
    expect(mocks.parseDecision).not.toHaveBeenCalled();
    expect(mocks.sendClarification).toHaveBeenCalledWith(null, "procurement@example.com", "msg-1", "unknown_reference");
  });

  it.each(["guided", "needs_detail", "rejected", "event_created"] as const)(
    "does not even read a reply about a request that is %s",
    async (status) => {
      mocks.getRequestByReference.mockResolvedValue(stubRequest({ status }));

      expect(await handleEmailReply(EMAIL)).toBe("not_awaiting_decision");
      expect(mocks.parseDecision).not.toHaveBeenCalled();
      expect(mocks.sendClarification).toHaveBeenCalledWith(expect.anything(), "procurement@example.com", "msg-1", "already_decided");
    },
  );

  it("retries a delivery whose first attempt never finished", async () => {
    mocks.recordInboundEmail.mockResolvedValue("retry");

    expect(await handleEmailReply(EMAIL)).toBe("applied");
  });

  it("leaves the reply unhandled and gives the claim back when the decision fails", async () => {
    mocks.applyDecision.mockRejectedValue(new Error("database unreachable"));

    await expect(handleEmailReply(EMAIL)).rejects.toThrow("database unreachable");
    expect(mocks.markInboundEmailProcessed).not.toHaveBeenCalled();
    expect(mocks.releaseInboundEmail).toHaveBeenCalledWith("msg-1");
  });

  it("lets the first decision stand when a contradicting reply lands in the same moment", async () => {
    mocks.applyDecision.mockRejectedValue(new InvalidTransition("event_created", "procurement_rejected"));

    expect(await handleEmailReply(EMAIL)).toBe("already_decided");
    expect(mocks.sendClarification).toHaveBeenCalledWith(REQUEST, "procurement@example.com", "msg-1", "already_decided");
  });
});
