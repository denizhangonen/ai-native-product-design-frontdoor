import { describe, expect, it } from "vitest";
import { scrubNote, toPublicRequest } from "@/domain/privacy";
import { stubRequest } from "@/services/testSupport";

describe("toPublicRequest", () => {
  it("drops the requester and the reason, and keeps everything else", () => {
    const shown = toPublicRequest(stubRequest());
    expect(shown).not.toHaveProperty("requester");
    expect(shown).not.toHaveProperty("reason");
    expect(shown.item).toBe("Figma");
    expect(shown.reading).toBeNull();
  });
});

describe("scrubNote", () => {
  it("keeps a note that names nobody", () => {
    expect(scrubNote("Item, seats and a yearly figure are all stated plainly.", "Pat Lee")).toBe(
      "Item, seats and a yearly figure are all stated plainly.",
    );
  });

  it("drops a note that names the requester, whatever the casing", () => {
    expect(scrubNote("pat lee needs five seats", "Pat Lee")).toBeNull();
  });

  it("drops a note carrying a handle or an address", () => {
    expect(scrubNote("read @pat's message as a request", "Someone Else")).toBeNull();
    expect(scrubNote("for pat@example.com", "Someone Else")).toBeNull();
  });

  it("does not treat a one-letter display name as a name", () => {
    expect(scrubNote("a yearly figure", "a")).toBe("a yearly figure");
  });

  it("passes null through", () => {
    expect(scrubNote(null, "Pat Lee")).toBeNull();
  });
});
