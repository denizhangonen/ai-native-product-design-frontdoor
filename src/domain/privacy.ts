import type { PurchaseRequest } from "@/domain/request";

/** What the public page may know about a request. No person, no address, no reason. */
export type PublicRequest = Omit<PurchaseRequest, "requester" | "reason">;

export function toPublicRequest(request: PurchaseRequest): PublicRequest {
  return {
    id: request.id,
    reference: request.reference,
    item: request.item,
    quantity: request.quantity,
    unit: request.unit,
    budget: request.budget,
    amountInMessage: request.amountInMessage,
    team: request.team,
    urgency: request.urgency,
    status: request.status,
    reading: request.reading,
    cap: request.cap,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

const ADDRESS_OR_HANDLE = /@/;

/**
 * A model's note about a message can repeat a name from it. The note is shown on a
 * public page, so one that names a person, a handle or an address is dropped whole.
 */
export function scrubNote(note: string | null, displayName: string): string | null {
  if (note === null) return null;
  if (ADDRESS_OR_HANDLE.test(note)) return null;
  const name = displayName.trim().toLowerCase();
  if (name.length > 1 && note.toLowerCase().includes(name)) return null;
  return note;
}
