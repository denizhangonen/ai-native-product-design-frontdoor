import { describe, expect, it } from "vitest";
import { maskAddress } from "@/integrations/email/mask";

describe("maskAddress", () => {
  it("keeps the domain and drops the person", () => {
    expect(maskAddress("procurement@example.com")).toBe("***@example.com");
  });

  it("handles an address inside a display name", () => {
    expect(maskAddress("Pat Buyer <procurement@example.com>")).toBe("***@example.com");
  });

  it.each(["", "not-an-address", "trailing@"])("hides %s entirely", (value) => {
    expect(maskAddress(value)).toBe("hidden");
  });
});
