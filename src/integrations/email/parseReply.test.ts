import { describe, expect, it } from "vitest";
import { extractReference, stripQuotedText } from "@/integrations/email/parseReply";

describe("extractReference", () => {
  it.each([
    ["[PI-1042] Purchase request: Figma, 5 seats, $3,000/year", "PI-1042"],
    ["Re: [PI-1042] Purchase request: Figma, 5 seats, $3,000/year", "PI-1042"],
    ["RE: RE: FW: [PI-9] Purchase request", "PI-9"],
    ["Antwort: [PI-1042] Anfrage", "PI-1042"],
  ])("finds the reference in %s", (subject, expected) => {
    expect(extractReference(subject)).toBe(expected);
  });

  it.each(["Purchase request: Figma", "", "Re: your message", "PI-"])(
    "returns null for %s",
    (subject) => {
      expect(extractReference(subject)).toBeNull();
    },
  );
});

describe("stripQuotedText", () => {
  it("keeps a plain reply untouched", () => {
    expect(stripQuotedText("approved")).toBe("approved");
  });

  it("drops Gmail quoting", () => {
    const body = [
      "Approved, but only for Q3.",
      "",
      "On Wed, Aug 20, 2026 at 10:00 AM Frontdoor <intake@example.com> wrote:",
      "> Requester is asking to buy Figma for the Design team.",
      "> Supplier: Meridian Supply",
    ].join("\n");

    expect(stripQuotedText(body)).toBe("Approved, but only for Q3.");
  });

  it("drops Outlook quoting", () => {
    const body = [
      "No, 2 days is the most we can give.",
      "",
      "________________________________",
      "From: Frontdoor <intake@example.com>",
      "Sent: 20 August 2026 10:00",
      "Subject: [PI-1042] Purchase request",
    ].join("\r\n");

    expect(stripQuotedText(body)).toBe("No, 2 days is the most we can give.");
  });

  it("drops the older Outlook original-message divider", () => {
    const body = ["approved", "", "-----Original Message-----", "From: Frontdoor"].join("\n");
    expect(stripQuotedText(body)).toBe("approved");
  });

  it("drops Apple Mail quoting", () => {
    const body = [
      "Fine by me.",
      "",
      "On 20 Aug 2026, at 10:00, Frontdoor <intake@example.com> wrote:",
      "",
      "Requester is asking to buy Figma for the Design team.",
    ].join("\n");

    expect(stripQuotedText(body)).toBe("Fine by me.");
  });

  it("drops a signature block", () => {
    const body = ["approved", "", "--", "Dee Lead", "Sourcing Director"].join("\n");
    expect(stripQuotedText(body)).toBe("approved");
  });

  it("drops a phone signature and everything after it", () => {
    const body = ["approved", "", "Sent from my iPhone", "", "> quoted text"].join("\n");
    expect(stripQuotedText(body)).toBe("approved");
  });

  it("keeps only the reply when several markers appear", () => {
    const body = [
      "Approved.",
      "",
      "Sent from my iPhone",
      "",
      "On 20 Aug 2026, at 10:00, Frontdoor wrote:",
      "> the original",
    ].join("\n");

    expect(stripQuotedText(body)).toBe("Approved.");
  });

  it("returns empty when the reply is only quoted text", () => {
    expect(stripQuotedText("> just a quote\n> and more")).toBe("");
  });

  // A marker on the opening line used to strip the entire reply away.
  it("keeps the reply when it opens with something that looks like a header", () => {
    expect(stripQuotedText("From: my side, approved.")).toBe("From: my side, approved.");
  });

  it("keeps the reply when it opens with a phone signature phrase", () => {
    const body = "Sent from my iPhone, approved.\n\n> quoted";
    expect(stripQuotedText(body)).toBe("Sent from my iPhone, approved.");
  });

  it("does not mistake a number or a dash inside the reply for a marker", () => {
    expect(stripQuotedText("2 days - that is our limit")).toBe("2 days - that is our limit");
  });
});
