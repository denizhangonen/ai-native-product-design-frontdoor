import { describe, expect, it } from "vitest";
import { InvalidTransition } from "@/domain/errors";
import {
  REQUEST_EVENTS,
  REQUEST_STATUSES,
  type RequestEvent,
  type RequestStatus,
  isFinal,
  transition,
} from "@/domain/status";

const ALLOWED: Array<[RequestStatus, RequestEvent, RequestStatus]> = [
  ["received", "detail_requested", "needs_detail"],
  ["received", "guided", "guided"],
  ["received", "routed", "with_procurement"],
  ["needs_detail", "guided", "guided"],
  ["needs_detail", "routed", "with_procurement"],
  ["with_procurement", "procurement_approved", "event_created"],
  ["with_procurement", "procurement_rejected", "rejected"],
];

describe("transition", () => {
  it.each(ALLOWED)("moves %s through %s to %s", (from, event, expected) => {
    expect(transition(from, event)).toBe(expected);
  });

  const allowedKeys = new Set(ALLOWED.map(([from, event]) => `${from}:${event}`));
  const forbidden = REQUEST_STATUSES.flatMap((from) =>
    REQUEST_EVENTS.filter((event) => !allowedKeys.has(`${from}:${event}`)).map(
      (event) => [from, event] as const,
    ),
  );

  it.each(forbidden)("refuses %s through %s", (from, event) => {
    expect(() => transition(from, event)).toThrow(InvalidTransition);
  });

  it("covers every status and event combination", () => {
    expect(ALLOWED.length + forbidden.length).toBe(REQUEST_STATUSES.length * REQUEST_EVENTS.length);
  });

  it("never leaves a final status", () => {
    for (const status of REQUEST_STATUSES.filter(isFinal)) {
      for (const event of REQUEST_EVENTS) {
        expect(() => transition(status, event)).toThrow(InvalidTransition);
      }
    }
  });

  it("treats guided as final: no human ever picks it up", () => {
    expect(isFinal("guided")).toBe(true);
  });

  it("never lets a guided request reach procurement", () => {
    expect(() => transition("guided", "routed")).toThrow(InvalidTransition);
    expect(() => transition("guided", "procurement_approved")).toThrow(InvalidTransition);
  });

  it("never approves a request that is not with procurement", () => {
    for (const status of REQUEST_STATUSES.filter((s) => s !== "with_procurement")) {
      expect(() => transition(status, "procurement_approved")).toThrow(InvalidTransition);
    }
  });
});
