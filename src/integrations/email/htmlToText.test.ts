import { describe, expect, it } from "vitest";
import { htmlToText } from "@/integrations/email/htmlToText";

describe("htmlToText", () => {
  it("keeps the words and drops the markup", () => {
    expect(htmlToText("<p>Approved, but only for <b>Q3</b>.</p>")).toBe(
      "Approved, but only for Q3.",
    );
  });

  it("turns block ends and line breaks into new lines", () => {
    expect(htmlToText("<p>Approved.</p><p>Thanks<br>Dee</p>")).toBe("Approved.\n\nThanks\nDee");
  });

  it("drops script and style content entirely", () => {
    expect(htmlToText("<style>p{color:red}</style><p>approve</p><script>x()</script>")).toBe(
      "approve",
    );
  });

  it("decodes entities after the tags are gone, so an escaped tag stays text", () => {
    expect(htmlToText("<p>&lt;b&gt; 12% &amp; no more&nbsp;&lt;/b&gt;</p>")).toBe(
      "<b> 12% & no more </b>",
    );
  });

  it("returns empty for markup with no words", () => {
    expect(htmlToText('<div><img src="x"></div>')).toBe("");
  });
});
