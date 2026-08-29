import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDecision } from "@/ai/parseDecision";
import { clearFixtures, setFixture } from "@/ai/providers/fake";

vi.mock("@/config", () => ({
  getConfig: () => ({ LLM_PROVIDER: "fake", MIN_PARSE_CONFIDENCE: 0.6 }),
}));

afterEach(() => {
  clearFixtures();
  vi.restoreAllMocks();
});

const PLAIN = {
  decision: "approve",
  note: null,
  capQuantity: null,
  capAmount: null,
  capPeriod: null,
  confidence: 0.95,
};

function fixture(reply: string, reading: Record<string, unknown>) {
  setFixture(reply, JSON.stringify({ ...PLAIN, ...reading }));
}

describe("parseDecision", () => {
  it("reads a plain approval", async () => {
    fixture("approved", {});

    expect(await parseDecision("approved")).toEqual({
      kind: "decided",
      model: "fake",
      reading: PLAIN,
    });
  });

  it("carries a seat cap and a money cap with its period as the model reported them", async () => {
    fixture("r", { capQuantity: 4, capAmount: 200, capPeriod: "monthly" });

    const outcome = await parseDecision("r");

    expect(outcome.kind === "decided" && outcome.reading.capQuantity).toBe(4);
    expect(outcome.kind === "decided" && outcome.reading.capAmount).toBe(200);
    expect(outcome.kind === "decided" && outcome.reading.capPeriod).toBe("monthly");
  });

  it("keeps a note only when the reply actually contains it", async () => {
    const reply = "Approve but cap at 4 seats, the fifth person can share.";
    fixture(reply, { note: "the fifth person can share", capQuantity: 4 });

    const outcome = await parseDecision(reply);

    expect(outcome.kind === "decided" && outcome.reading.note).toBe("the fifth person can share");
  });

  it("drops a note the model wrote itself rather than passing it on as procurement's words", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fixture("approved", { note: "but only for the design team" });

    const outcome = await parseDecision("approved");

    expect(outcome.kind === "decided" && outcome.reading.note).toBeNull();
  });

  it("comes back unclear when the model says so", async () => {
    fixture("r", { decision: "unclear" });

    expect(await parseDecision("r")).toEqual({ kind: "unclear", reason: "reply was not a decision" });
  });

  it("comes back unclear when the model is not sure", async () => {
    fixture("r", { confidence: 0.4 });

    expect(await parseDecision("r")).toEqual({ kind: "unclear", reason: "not confident enough to act" });
  });

  it.each([
    ["a decision that is not in the list", { decision: "maybe" }],
    ["a fractional seat cap", { capQuantity: 2.5 }],
    ["a negative money cap", { capAmount: -1 }],
    ["a cap period that is not in the list", { capPeriod: "weekly" }],
    ["a missing confidence", { confidence: undefined }],
  ])("reports model output with %s as a failure, not a decision", async (_label, reading) => {
    fixture("r", reading);

    expect((await parseDecision("r")).kind).toBe("failed");
  });

  it("reports a model timeout as a failure, not as an unclear reply", async () => {
    vi.useFakeTimers();
    const provider = await import("@/ai/providers/fake");
    vi.spyOn(provider.fakeProvider, "complete").mockImplementation(() => new Promise(() => {}));

    const pending = parseDecision("approved");
    await vi.advanceTimersByTimeAsync(10_001);

    expect(await pending).toEqual({ kind: "failed", reason: "model timed out" });
    vi.useRealTimers();
  });

  it("never lets the model state a status or a route", async () => {
    fixture("r", { status: "event_created", route: "guided" });

    const outcome = await parseDecision("r");

    expect(outcome.kind).toBe("decided");
    expect(outcome.kind === "decided" && Object.keys(outcome.reading)).not.toContain("status");
  });
});

describe("the fake provider's own reading", () => {
  it.each([
    ["approved", { decision: "approve", capQuantity: null, capAmount: null }],
    ["Approve but cap at 4 seats, the fifth person can share.", { decision: "approve", capQuantity: 4, note: "the fifth person can share" }],
    ["OK, up to $2k a year, not more.", { decision: "approve", capAmount: 2000, capPeriod: "annual" }],
    ["Fine, but $200 a month is the limit.", { decision: "approve", capAmount: 200, capPeriod: "monthly" }],
    ["approve, no more than $1,500", { decision: "approve", capAmount: 1500, capPeriod: null }],
    ["Reject, we already have an org licence for this.", { decision: "reject", note: "we already have an org licence for this" }],
  ])("reads %s", async (reply, expected) => {
    const outcome = await parseDecision(reply);
    expect(outcome.kind).toBe("decided");
    expect(outcome.kind === "decided" && outcome.reading).toMatchObject(expected);
  });

  it("is unclear about a question", async () => {
    expect((await parseDecision("Has IT looked at this?")).kind).toBe("unclear");
  });
});
