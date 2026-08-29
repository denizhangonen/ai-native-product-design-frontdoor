import { InvalidTransition } from "@/domain/errors";

/** `received` exists only inside the submit transaction; a request never rests there. */
export const REQUEST_STATUSES = [
  "received",
  "needs_detail",
  "guided",
  "with_procurement",
  "rejected",
  "event_created",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_EVENTS = [
  "detail_requested",
  "guided",
  "routed",
  "procurement_approved",
  "procurement_rejected",
] as const;

export type RequestEvent = (typeof REQUEST_EVENTS)[number];

const TRANSITIONS: Record<RequestStatus, Partial<Record<RequestEvent, RequestStatus>>> = {
  received: { detail_requested: "needs_detail", guided: "guided", routed: "with_procurement" },
  needs_detail: { guided: "guided", routed: "with_procurement" },
  with_procurement: {
    procurement_approved: "event_created",
    procurement_rejected: "rejected",
  },
  guided: {},
  rejected: {},
  event_created: {},
};

export function transition(from: RequestStatus, event: RequestEvent): RequestStatus {
  const next = TRANSITIONS[from][event];
  if (!next) throw new InvalidTransition(from, event);
  return next;
}

export function isFinal(status: RequestStatus): boolean {
  return status === "guided" || status === "rejected" || status === "event_created";
}
