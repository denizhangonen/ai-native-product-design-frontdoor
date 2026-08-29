import { afterEach, describe, expect, it, vi } from "vitest";
import { parseRequest } from "@/ai/parseRequest";
import { clearFixtures, setFixture } from "@/ai/providers/fake";

vi.mock("@/config", () => ({
  getConfig: () => ({ LLM_PROVIDER: "fake", MIN_PARSE_CONFIDENCE: 0.6 }),
}));

afterEach(() => {
  clearFixtures();
  vi.restoreAllMocks();
});

const COMPLETE = {
  item: "Figma",
  quantity: 5,
  unit: "seats",
  amount: 3000,
  period: "annual",
  currency: "USD",
  team: "Design",
  urgency: "this_month",
  reason: null,
  confidence: 0.95,
};

function fixture(message: string, extraction: Record<string, unknown>) {
  setFixture(message, JSON.stringify({ ...COMPLETE, ...extraction }));
}

describe("parseRequest", () => {
  it("reads a complete request", async () => {
    fixture("m", {});

    const outcome = await parseRequest("m");

    expect(outcome).toEqual({
      kind: "parsed",
      model: "fake",
      extraction: { ...COMPLETE, rationale: null },
    });
  });

  it.each([
    ["the cost", { amount: null }, ["budget"]],
    ["the item", { item: null }, ["item"]],
    ["both", { item: null, amount: null }, ["item", "budget"]],
  ])("reports %s as missing", async (_label, extraction, missing) => {
    fixture("m", { ...extraction, confidence: 0.9 });

    const outcome = await parseRequest("m");

    expect(outcome.kind).toBe("incomplete");
    expect(outcome.kind === "incomplete" && outcome.missing).toEqual(missing);
  });

  it("does not treat a missing period, currency, or team as missing: the policy handles those", async () => {
    fixture("m", { period: null, currency: null, team: null });

    expect((await parseRequest("m")).kind).toBe("parsed");
  });

  it("refuses to guess when the model is unsure", async () => {
    fixture("m", { confidence: 0.4 });

    expect(await parseRequest("m")).toEqual({
      kind: "unreadable",
      reason: "not recognised as a purchase request",
    });
  });

  it.each([
    ["prose instead of JSON", "I think they want Figma"],
    ["a fenced code block", '```json\n{"item":"Figma"}\n```'],
    ["truncated JSON", '{"item":"Figma","amount":'],
    ["an empty answer", ""],
  ])("reports %s as a model failure, not as the person's fault", async (_label, response) => {
    setFixture("m", response);

    expect(await parseRequest("m")).toEqual({
      kind: "failed",
      reason: "model did not return valid JSON",
    });
  });

  it.each([
    ["a negative amount", { amount: -5 }],
    ["a quantity of zero", { quantity: 0 }],
    ["a fractional quantity", { quantity: 1.5 }],
    ["a period that is not in the list", { period: "weekly" }],
    ["a currency that is not a code", { currency: "dollars" }],
    ["an urgency that is not in the list", { urgency: "yesterday" }],
    ["a confidence above 1", { confidence: 4 }],
    ["a missing confidence", { confidence: undefined }],
    ["an item that is a number", { item: 42 }],
    ["a route, which the model must never state", { route: "guided", extra: true, item: 42 }],
  ])("refuses model output with %s, as a model failure", async (_label, extraction) => {
    fixture("m", extraction);

    expect((await parseRequest("m")).kind).toBe("failed");
  });

  it("ignores extra keys such as a status or a route rather than letting them through", async () => {
    fixture("m", { route: "guided", status: "approved" });

    const outcome = await parseRequest("m");

    expect(outcome.kind).toBe("parsed");
    expect(outcome.kind === "parsed" && Object.keys(outcome.extraction)).not.toContain("route");
    expect(outcome.kind === "parsed" && Object.keys(outcome.extraction)).not.toContain("status");
  });

  it("uppercases the currency code", async () => {
    fixture("m", { currency: "usd" });
    const outcome = await parseRequest("m");
    expect(outcome.kind === "parsed" && outcome.extraction.currency).toBe("USD");
  });

  it("carries the model's own note on how it read the message", async () => {
    fixture("m", { rationale: "Item, seats and a yearly figure are all stated plainly." });

    const outcome = await parseRequest("m");

    expect(outcome.kind === "parsed" && outcome.extraction.rationale).toBe(
      "Item, seats and a yearly figure are all stated plainly.",
    );
  });

  it("refuses a note long enough to be an essay rather than a note", async () => {
    fixture("m", { rationale: "x".repeat(201) });

    expect((await parseRequest("m")).kind).toBe("failed");
  });

  it("gives the model a second chance at valid JSON", async () => {
    const responses = ["not json at all", JSON.stringify(COMPLETE)];
    let call = 0;
    const provider = await import("@/ai/providers/fake");
    vi.spyOn(provider.fakeProvider, "complete").mockImplementation(async () => {
      call += 1;
      return responses[call - 1];
    });

    const outcome = await parseRequest("m");

    expect(call).toBe(2);
    expect(outcome.kind).toBe("parsed");
  });

  it("never sends more than 2000 characters to the model", async () => {
    const provider = await import("@/ai/providers/fake");
    const spy = vi.spyOn(provider.fakeProvider, "complete").mockResolvedValue(JSON.stringify(COMPLETE));

    await parseRequest("x".repeat(50_000));

    expect(spy.mock.calls[0][0].user).toHaveLength(2_000);
  });

  it("gives up rather than hanging when the model does not answer", async () => {
    vi.useFakeTimers();
    const provider = await import("@/ai/providers/fake");
    vi.spyOn(provider.fakeProvider, "complete").mockImplementation(() => new Promise(() => {}));

    const pending = parseRequest("m");
    await vi.advanceTimersByTimeAsync(10_001);

    expect(await pending).toEqual({ kind: "failed", reason: "model timed out" });
    vi.useRealTimers();
  });
});
