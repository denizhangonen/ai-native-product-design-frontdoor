import { describe, expect, it } from "vitest";
import type { CompleteRequest } from "@/domain/request";
import { needMoreDetail, notUnderstood, startFresh, understood } from "@/integrations/slack/replies";
import { stubRequest } from "@/services/testSupport";

const POLICY_URL = "https://example.com/policy";
const request = stubRequest({ status: "with_procurement" }) as CompleteRequest;

describe("understood", () => {
  it("says back the request, the rule's own reason, and the reference", () => {
    const text = understood(
      request,
      { route: "procurement", reason: "$3,000/year is above the $1,000/year threshold, so procurement must approve", flags: [] },
      POLICY_URL,
    );

    expect(text).toContain("Understood: Figma, 5 seats, $3,000/year for the Design team.");
    expect(text).toContain("$3,000/year is above the $1,000/year threshold");
    expect(text).toContain("Routing to procurement with a brief.");
    expect(text).toContain("Reference PI-1001.");
    expect(text).not.toContain(POLICY_URL);
  });

  it("gives the guided answer with the policy link and no mention of procurement", () => {
    const text = understood(
      request,
      { route: "guided", reason: "$600/year is within the $1,000/year threshold", flags: [] },
      POLICY_URL,
    );

    expect(text).toContain("no approval is needed: use the team card");
    expect(text).toContain(POLICY_URL);
    expect(text).toContain("Logged for finance visibility.");
    expect(text).not.toContain("procurement");
  });

  it("leaves the team out when none was given", () => {
    const text = understood(
      { ...request, team: null },
      { route: "guided", reason: "within", flags: [] },
      POLICY_URL,
    );
    expect(text).toContain("Understood: Figma, 5 seats, $3,000/year.");
  });
});

describe("the questions", () => {
  it("names what is missing in plain words and says to reply in the thread", () => {
    const text = needMoreDetail(["budget"]);
    expect(text).toContain("roughly what it costs");
    expect(text).toContain("Reply here in this thread");
  });

  it("names both when both are missing", () => {
    expect(needMoreDetail(["item", "budget"])).toContain("what you need and roughly what it costs");
  });

  it("tells the person to start fresh, with an example, after the last ask", () => {
    const text = startFresh(["budget"]);
    expect(text).toContain("post a fresh request");
    expect(text).toContain("Something like:");
  });

  it("gives an example when nothing could be read", () => {
    expect(notUnderstood()).toContain("Something like: Need Figma");
  });
});
