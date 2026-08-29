import { describe, expect, it } from "vitest";
import { isProcurement, normaliseAddress } from "@/guards/procurementAllowlist";

const PROCUREMENT = ["procurement@example.com", "cpo@example.com"];

describe("normaliseAddress", () => {
  it.each([
    ["procurement@example.com", "procurement@example.com"],
    ["Pat Buyer <procurement@example.com>", "procurement@example.com"],
    ["  PROCUREMENT@Example.COM  ", "procurement@example.com"],
    ['"Buyer Pat" <Procurement@Example.com>', "procurement@example.com"],
  ])("reads %s as %s", (input, expected) => {
    expect(normaliseAddress(input)).toBe(expected);
  });
});

describe("isProcurement", () => {
  it.each([
    "procurement@example.com",
    "Pat Buyer <procurement@example.com>",
    "PROCUREMENT@EXAMPLE.COM",
    "cpo@example.com",
  ])("accepts %s", (from) => {
    expect(isProcurement(from, PROCUREMENT)).toBe(true);
  });

  it.each([
    "requester@example.com",
    "attacker@evil.com",
    "procurement@example.com.evil.com",
    // The display name looks like procurement, the real address is not.
    "procurement@example.com <attacker@evil.com>",
    // Malformed headers are refused rather than salvaged.
    "evil.com<procurement@example.com>x",
    "<procurement@example.com> trailing",
    "procurement@example.com, attacker@evil.com",
    "procurement@example.com attacker@evil.com",
    "",
    "   ",
    "not-an-address",
  ])("refuses %s", (from) => {
    expect(isProcurement(from, PROCUREMENT)).toBe(false);
  });

  it("lets nobody decide when no address is configured", () => {
    expect(isProcurement("procurement@example.com", [])).toBe(false);
  });
});
