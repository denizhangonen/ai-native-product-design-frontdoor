import { describe, expect, it } from "vitest";
import { describeRequest, formatBudget, formatMoney, formatQuantity } from "@/domain/format";

describe("formatMoney", () => {
  it("shows whole dollars without cents", () => {
    expect(formatMoney(300_000)).toBe("$3,000");
  });

  it("shows cents when there are any", () => {
    expect(formatMoney(8_334)).toBe("$83.34");
  });

  it("shows a bare number when no currency was stated", () => {
    expect(formatMoney(300_000, null)).toBe("3,000");
  });

  it("names a currency other than USD instead of using a dollar sign", () => {
    expect(formatMoney(250_000, "EUR")).toBe("EUR 2,500");
  });
});

describe("formatBudget", () => {
  it.each([
    ["annual", "$3,000/year"],
    ["monthly", "$3,000/month"],
    ["one_off", "$3,000 one-off"],
  ] as const)("labels a %s budget", (period, expected) => {
    expect(formatBudget({ amountCents: 300_000, period, currency: "USD" })).toBe(expected);
  });

  it("says so when the period was not stated", () => {
    expect(formatBudget({ amountCents: 300_000, period: null, currency: "USD" })).toBe(
      "$3,000 (period not stated)",
    );
  });

  it("says so when the currency was not stated, and when neither was", () => {
    expect(formatBudget({ amountCents: 300_000, period: "annual", currency: null })).toBe(
      "3,000/year (currency not stated)",
    );
    expect(formatBudget({ amountCents: 300_000, period: null, currency: null })).toBe(
      "3,000 (currency and period not stated)",
    );
  });
});

describe("formatQuantity", () => {
  it("uses the unit the message used", () => {
    expect(formatQuantity(5, "seats")).toBe("5 seats");
  });

  it("falls back to units, singular for one", () => {
    expect(formatQuantity(1, null)).toBe("1 unit");
    expect(formatQuantity(3, null)).toBe("3 units");
  });
});

describe("describeRequest", () => {
  const budget = { amountCents: 300_000, period: "annual" as const, currency: "USD" };

  it("reads like the request a person made", () => {
    expect(describeRequest({ item: "Figma", quantity: 5, unit: "seats", budget })).toBe(
      "Figma, 5 seats, $3,000/year",
    );
  });

  it("leaves the quantity out when there was none", () => {
    expect(describeRequest({ item: "A market report", quantity: null, unit: null, budget })).toBe(
      "A market report, $3,000/year",
    );
  });
});
