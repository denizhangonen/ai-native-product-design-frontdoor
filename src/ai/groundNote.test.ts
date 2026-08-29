import { describe, expect, it } from "vitest";
import { quotedNote } from "@/ai/groundNote";

describe("quotedNote", () => {
  it("keeps a note the approver actually wrote", () => {
    expect(quotedNote("only for Q3", "Fine by me, but only for Q3.")).toBe("only for Q3");
  });

  it("ignores punctuation and casing differences", () => {
    expect(quotedNote("12% is the most we can do", "No -- 12%, is the MOST we can do!")).toBe(
      "12% is the most we can do",
    );
  });

  // The reply said the opposite. A note like this reached a rep once.
  it("drops a note the model invented", () => {
    const note = "A 10 day extension is not acceptable, but a counter can be negotiated";
    expect(quotedNote(note, "You can even make it like 50% mate!")).toBeNull();
  });

  it("drops a note that only partly appears in the reply", () => {
    expect(quotedNote("only for Q3 and Q4", "Fine by me, but only for Q3.")).toBeNull();
  });

  it("has nothing to keep when there is no note", () => {
    expect(quotedNote(null, "approved")).toBeNull();
  });
});
