import { describe, expect, it } from "vitest";
import { configSchema } from "@/config";

const BASE = { DATABASE_URL: "postgresql://localhost/x" };

describe("configSchema", () => {
  it("defaults the policy threshold to 1000 dollars a year and the model to fake", () => {
    const config = configSchema.parse(BASE);
    expect(config.POLICY_THRESHOLD_USD_PER_YEAR).toBe(1000);
    expect(config.LLM_PROVIDER).toBe("fake");
    expect(config.EMAIL_PROVIDER).toBe("fake");
  });

  it("reads the threshold from the environment", () => {
    const config = configSchema.parse({ ...BASE, POLICY_THRESHOLD_USD_PER_YEAR: "2500" });
    expect(config.POLICY_THRESHOLD_USD_PER_YEAR).toBe(2500);
  });

  it("rejects a missing database url", () => {
    expect(configSchema.safeParse({}).success).toBe(false);
  });

  it("treats an empty variable as not set, never as zero", () => {
    const config = configSchema.parse({
      ...BASE,
      POLICY_THRESHOLD_USD_PER_YEAR: "",
      MIN_PARSE_CONFIDENCE: "",
    });
    expect(config.POLICY_THRESHOLD_USD_PER_YEAR).toBe(1000);
    expect(config.MIN_PARSE_CONFIDENCE).toBe(0.6);
  });

  it("rejects a negative or absurd threshold", () => {
    for (const value of ["-1", "abc", "99999999999"]) {
      const result = configSchema.safeParse({ ...BASE, POLICY_THRESHOLD_USD_PER_YEAR: value });
      expect(result.success).toBe(false);
    }
  });

  it("splits, trims and lowercases the procurement addresses", () => {
    const config = configSchema.parse({
      ...BASE,
      PROCUREMENT_EMAILS: " Buyer@Example.com, ,lead@example.com ",
    });
    expect(config.PROCUREMENT_EMAILS).toEqual(["buyer@example.com", "lead@example.com"]);
  });

  it("has nobody able to decide when no addresses are configured", () => {
    expect(configSchema.parse(BASE).PROCUREMENT_EMAILS).toEqual([]);
  });
});
