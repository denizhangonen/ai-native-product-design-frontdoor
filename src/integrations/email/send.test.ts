import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompleteRequest } from "@/domain/request";
import { clearOutbox, readOutbox } from "@/integrations/email/providers/fake";
import { sendBrief, sendClarification } from "@/integrations/email/send";
import { stubRequest } from "@/services/testSupport";

const config = {
  EMAIL_PROVIDER: "fake",
  EMAIL_FROM: "Frontdoor <intake@example.com>",
  EMAIL_REPLY_TO: "intake@example.com",
  PROCUREMENT_EMAILS: ["procurement@example.com"],
};

vi.mock("@/config", () => ({ getConfig: () => config }));

const REQUEST = stubRequest({ status: "with_procurement", reference: "PI-1042" }) as CompleteRequest;
const POLICY = {
  route: "procurement" as const,
  reason: "$3,000/year is above the $1,000/year threshold, so procurement must approve",
  flags: [],
};

beforeEach(() => {
  clearOutbox();
  config.PROCUREMENT_EMAILS = ["procurement@example.com"];
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("sendBrief", () => {
  it("carries the reference and the request in the subject so a reply can be matched back", async () => {
    await sendBrief(REQUEST, POLICY);

    expect(readOutbox()[0].subject).toBe("[PI-1042] Purchase request: Figma, 5 seats, $3,000/year");
    expect(readOutbox()[0].reference).toBe("PI-1042");
  });

  it("points replies at the intake address, not the sender", async () => {
    await sendBrief(REQUEST, POLICY);

    const [sent] = readOutbox();
    expect(sent.from).toBe("Frontdoor <intake@example.com>");
    expect(sent.replyTo).toBe("intake@example.com");
    expect(sent.to).toBe("procurement@example.com");
  });

  it("is a brief: the facts, the policy check, the gaps, and how to answer", async () => {
    await sendBrief(REQUEST, POLICY);

    const { text } = readOutbox()[0];
    expect(text).toContain("Requester is asking to buy Figma for the Design team.");
    expect(text).toContain("Item:      Figma");
    expect(text).toContain("Quantity:  5 seats");
    expect(text).toContain("Budget:    $3,000/year");
    expect(text).toContain("Needed:    this month");
    expect(text).toContain("Reason:    the design team is growing");
    expect(text).toContain("Policy check: $3,000/year is above the $1,000/year threshold");
    expect(text).toMatch(/reply approve or reject/i);
    expect(text).toContain("cap at 4 seats");
  });

  it("shows a monthly figure as read and by the year", async () => {
    const monthly = { ...REQUEST, budget: { amountCents: 25_000, period: "monthly" as const, currency: "USD" } };

    await sendBrief(monthly, POLICY);

    expect(readOutbox()[0].text).toContain("Budget:    $250/month, $3,000/year");
  });

  it("says what was not given, and lists it once at the end", async () => {
    await sendBrief({ ...REQUEST, quantity: null, unit: null, team: null, urgency: null, reason: null }, POLICY);

    const { text } = readOutbox()[0];
    expect(text).toContain("Requester is asking to buy Figma.");
    expect(text).toContain("Quantity:  not given");
    expect(text).toContain("Reason:    not given");
    expect(text).toContain("Not in the request: quantity, team, when it is needed, reason.");
  });

  it("carries a fails-closed reason word for word", async () => {
    await sendBrief(REQUEST, {
      route: "procurement",
      reason: "Fails closed: no currency was stated, so procurement must look at it",
      flags: ["currency_not_stated"],
    });

    expect(readOutbox()[0].text).toContain("Policy check: Fails closed: no currency was stated");
  });

  it("mails every configured address, each with its own idempotency key", async () => {
    config.PROCUREMENT_EMAILS = ["procurement@example.com", "cpo@example.com"];

    await sendBrief(REQUEST, POLICY);

    expect(readOutbox().map((email) => email.to)).toEqual(["procurement@example.com", "cpo@example.com"]);
    expect(readOutbox().map((email) => email.idempotencyKey)).toEqual([
      "brief:PI-1042:procurement@example.com",
      "brief:PI-1042:cpo@example.com",
    ]);
  });

  it("sends nothing when no address is configured", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    config.PROCUREMENT_EMAILS = [];

    await sendBrief(REQUEST, POLICY);

    expect(readOutbox()).toHaveLength(0);
  });
});

describe("sendClarification", () => {
  it("keeps the reference and asks for a plain answer", async () => {
    await sendClarification(REQUEST, "procurement@example.com", "msg-1", "unclear");

    const [sent] = readOutbox();
    expect(sent.subject).toContain("PI-1042");
    expect(sent.text).toContain("nothing has changed");
    expect(sent.text).toContain("The request: Figma, 5 seats, $3,000/year.");
    expect(sent.text).toMatch(/approve or reject/i);
  });

  it("explains a limit that did not fit", async () => {
    await sendClarification(REQUEST, "procurement@example.com", "msg-1", "cap");

    expect(readOutbox()[0].text).toContain("That limit did not fit the request");
  });

  it("tells the sender when a request was already decided, without asking again", async () => {
    await sendClarification(REQUEST, "procurement@example.com", "msg-1", "already_decided");

    const [sent] = readOutbox();
    expect(sent.subject).toBe("[PI-1042] Nothing has changed");
    expect(sent.text).toContain("already decided");
    expect(sent.text).not.toContain("Reply with approve or reject");
  });

  it("tells the sender when a reply could not be matched, with no request to name", async () => {
    await sendClarification(null, "procurement@example.com", "msg-1", "unknown_reference");

    const [sent] = readOutbox();
    expect(sent.subject).toBe("Nothing has changed");
    expect(sent.text).toContain("could not match");
    expect(sent.reference).toBeNull();
  });

  it("marks every answer as an auto-reply, so a mailbox does not answer it back", async () => {
    await sendClarification(REQUEST, "procurement@example.com", "msg-1", "unclear");

    expect(readOutbox()[0].headers).toEqual({
      "Auto-Submitted": "auto-replied",
      "X-Auto-Response-Suppress": "All",
    });
  });


  it("keys each clarification to the reply it answers", async () => {
    await sendClarification(REQUEST, "procurement@example.com", "msg-1", "unclear");
    await sendClarification(REQUEST, "procurement@example.com", "msg-2", "unclear");

    expect(readOutbox().map((sent) => sent.idempotencyKey)).toEqual(["clarify:msg-1", "clarify:msg-2"]);
  });
});
