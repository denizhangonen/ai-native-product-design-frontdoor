import { afterEach, describe, expect, it } from "vitest";
import { PARSE_REQUEST_SYSTEM_PROMPT } from "@/ai/prompts/parseRequest";
import { clearFixtures, fakeProvider, setFixture } from "@/ai/providers/fake";
import { extractionSchema } from "@/ai/schemas";

afterEach(clearFixtures);

async function read(message: string) {
  const raw = await fakeProvider.complete({
    task: "parse_request",
    system: PARSE_REQUEST_SYSTEM_PROMPT,
    user: message,
  });
  return extractionSchema.parse(JSON.parse(raw));
}

const FIXED = JSON.stringify({
  item: "Fixed",
  quantity: null,
  unit: null,
  amount: 1,
  period: null,
  currency: "USD",
  team: null,
  urgency: null,
  reason: null,
  confidence: 1,
});

describe("fakeProvider", () => {
  it("prefers a fixture over its own guessing", async () => {
    setFixture("anything", FIXED);
    expect((await read("anything")).item).toBe("Fixed");
  });

  it("matches a fixture regardless of spacing and case", async () => {
    setFixture("Need Figma", FIXED);
    expect((await read("  need   FIGMA  ")).item).toBe("Fixed");
  });

  it("reads the demo request", async () => {
    const extraction = await read(
      "Need Figma for the design team, 5 seats, about $3k/year, sometime this month",
    );
    expect(extraction).toMatchObject({
      item: "Figma",
      quantity: 5,
      unit: "seats",
      amount: 3000,
      period: "annual",
      currency: "USD",
      team: "Design",
      urgency: "this_month",
    });
    expect(extraction.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it.each([
    ["Can I get a Grammarly subscription? $12 a month", { item: "Grammarly subscription", amount: 12, period: "monthly", currency: "USD" }],
    ["We want to buy the Gartner market report, around €2,500", { item: "Gartner market report", amount: 2500, period: null, currency: "EUR" }],
    ["need 3 licences for Sketch, $99 one-off each", { quantity: 3, unit: "licences", amount: 99, period: "one_off" }],
    ["Want a Loom licence for the sales team, 1,200 a year", { item: "Loom licence", team: "Sales", amount: null, currency: null }],
  ])("reads %s", async (message, expected) => {
    expect(await read(message)).toMatchObject(expected);
  });

  it("does not mistake the seat count for the price", async () => {
    const extraction = await read("need 5 seats of Figma, $3k/year");
    expect(extraction.quantity).toBe(5);
    expect(extraction.amount).toBe(3000);
  });

  it("is not confident about a message that is not a purchase request", async () => {
    const extraction = await read("who has the office wifi password?");
    expect(extraction.confidence).toBe(0);
    expect(extraction.item).toBeNull();
  });

  it("still recognises a purchase request when the cost is missing, so it can be asked for", async () => {
    const extraction = await read("need a few more Notion seats for the ops team");
    expect(extraction.amount).toBeNull();
    expect(extraction.item).toBe("Notion seats");
    expect(extraction.confidence).toBe(0.7);
  });

  it("always returns output that satisfies the schema", async () => {
    const messages = ["", "???", "$5", "need", "3 seats", "for the Design team", "€"];
    for (const message of messages) {
      await expect(read(message)).resolves.toBeDefined();
    }
  });
});
