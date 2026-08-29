import { describe, expect, it } from "vitest";
import { MAX_DETAIL_ASKS, canAskAgain, judgeThreadReply } from "@/domain/thread";
import { stubRequest } from "@/services/testSupport";

describe("judgeThreadReply", () => {
  it("lets the requester answer while the request is waiting", () => {
    const waiting = stubRequest({ status: "needs_detail" });
    expect(judgeThreadReply(waiting, "U123")).toBe("answer");
  });

  it("ignores anyone who is not the requester, even while waiting", () => {
    const waiting = stubRequest({ status: "needs_detail" });
    expect(judgeThreadReply(waiting, "U999")).toBe("not_requester");
  });

  it.each(["guided", "with_procurement", "rejected", "event_created", "received"] as const)(
    "ignores a reply on a request that is %s, even from the requester",
    (status) => {
      expect(judgeThreadReply(stubRequest({ status }), "U123")).toBe("not_waiting");
    },
  );
});

describe("canAskAgain", () => {
  it("allows a second question and no more", () => {
    expect(MAX_DETAIL_ASKS).toBe(2);
    expect(canAskAgain(1)).toBe(true);
    expect(canAskAgain(2)).toBe(false);
  });
});
