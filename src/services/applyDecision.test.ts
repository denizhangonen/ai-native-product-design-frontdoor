import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidRequestInput, InvalidTransition, RequestNotFound } from "@/domain/errors";
import type { RequestStatus } from "@/domain/status";
import { applyDecision } from "@/services/applyDecision";
import { stubRequest } from "@/services/testSupport";

const mocks = vi.hoisted(() => ({
  getRequestForUpdate: vi.fn(),
  updateStatusAndCap: vi.fn(),
  insertEvent: vi.fn(),
  appendTrail: vi.fn(),
  begin: vi.fn(),
}));

vi.mock("@/data/db", () => ({ db: () => ({ begin: mocks.begin }) }));
vi.mock("@/data/requests", () => ({
  getRequestForUpdate: mocks.getRequestForUpdate,
  updateStatusAndCap: mocks.updateStatusAndCap,
}));
vi.mock("@/data/events", () => ({ insertEvent: mocks.insertEvent }));
vi.mock("@/data/trail", () => ({ appendTrail: mocks.appendTrail }));

const ACTOR = "procurement@example.com";
const READING = { confidence: 0.9, model: "fake" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.begin.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({}),
  );
  mocks.getRequestForUpdate.mockResolvedValue(stubRequest({ status: "with_procurement" }));
  mocks.updateStatusAndCap.mockImplementation(async (_id: string, status: RequestStatus, cap) =>
    stubRequest({ status, cap }),
  );
  mocks.insertEvent.mockImplementation(async (input) => ({ id: "ev-1", ...input }));
  mocks.appendTrail.mockResolvedValue(undefined);
});

describe("applyDecision", () => {
  it("reads the row under a lock inside the transaction, not before it", async () => {
    await applyDecision({ requestId: "req-1", decision: "approve", actor: ACTOR });

    expect(mocks.getRequestForUpdate).toHaveBeenCalledWith("req-1", {});
    expect(mocks.begin).toHaveBeenCalledTimes(1);
  });

  it("approves by creating the event in the same transaction", async () => {
    const result = await applyDecision({
      requestId: "req-1",
      decision: "approve",
      actor: ACTOR,
      reading: READING,
    });

    expect(result.request.status).toBe("event_created");
    expect(result.changed).toBe(true);
    expect(result.event?.id).toBe("ev-1");
    expect(mocks.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-1",
        title: "Figma",
        quantity: 5,
        unit: "seats",
        budget: { amountCents: 300_000, period: "annual", currency: "USD" },
      }),
      {},
    );
    expect(mocks.appendTrail).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "procurement_approved",
        actor: ACTOR,
        payload: { eventId: "ev-1" },
        reading: READING,
      }),
      {},
    );
  });

  it("approves with a cap: the event carries the capped figures and the cap is recorded", async () => {
    const cap = { quantity: 4, annualCents: null };

    const result = await applyDecision({
      requestId: "req-1",
      decision: "approve",
      actor: ACTOR,
      cap,
      note: "approve but cap at 4 seats",
    });

    expect(mocks.updateStatusAndCap).toHaveBeenCalledWith("req-1", "event_created", cap, {});
    expect(mocks.insertEvent).toHaveBeenCalledWith(expect.objectContaining({ quantity: 4 }), {});
    expect(result.request.cap).toEqual(cap);
    expect(mocks.appendTrail).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { note: "approve but cap at 4 seats", cap, eventId: "ev-1" },
      }),
      {},
    );
  });

  it.each([
    ["above what was asked", { quantity: 6, annualCents: null }],
    ["on a budget above the annual figure", { quantity: null, annualCents: 300_001 }],
  ])("refuses a cap %s before writing anything", async (_label, cap) => {
    await expect(
      applyDecision({ requestId: "req-1", decision: "approve", actor: ACTOR, cap }),
    ).rejects.toThrow(InvalidRequestInput);
    expect(mocks.updateStatusAndCap).not.toHaveBeenCalled();
    expect(mocks.insertEvent).not.toHaveBeenCalled();
  });

  it("refuses a quantity cap on a request that never had a quantity", async () => {
    mocks.getRequestForUpdate.mockResolvedValue(
      stubRequest({ status: "with_procurement", quantity: null, unit: null }),
    );

    await expect(
      applyDecision({
        requestId: "req-1",
        decision: "approve",
        actor: ACTOR,
        cap: { quantity: 2, annualCents: null },
      }),
    ).rejects.toThrow(InvalidRequestInput);
  });

  it("records no cap when the cap equals what was asked: that is a plain approval", async () => {
    await applyDecision({
      requestId: "req-1",
      decision: "approve",
      actor: ACTOR,
      cap: { quantity: 5, annualCents: 300_000 },
    });

    expect(mocks.updateStatusAndCap).toHaveBeenCalledWith("req-1", "event_created", null, {});
    expect(mocks.insertEvent).toHaveBeenCalledWith(expect.objectContaining({ quantity: 5 }), {});
  });

  it("ignores a cap on a rejection", async () => {
    await applyDecision({
      requestId: "req-1",
      decision: "reject",
      actor: ACTOR,
      cap: { quantity: 4, annualCents: null },
    });

    expect(mocks.updateStatusAndCap).toHaveBeenCalledWith("req-1", "rejected", null, {});
  });

  it.each([
    ["an empty actor", { actor: "" }],
    ["a note longer than a note", { note: "x".repeat(2001) }],
    ["a cap of zero", { cap: { quantity: 0, annualCents: null } }],
    ["a confidence above one", { reading: { confidence: 2, model: "fake" } }],
  ])("refuses %s before touching the database", async (_label, overrides) => {
    await expect(
      applyDecision({ requestId: "req-1", decision: "approve", actor: ACTOR, ...overrides }),
    ).rejects.toThrow(InvalidRequestInput);
    expect(mocks.begin).not.toHaveBeenCalled();
  });

  it("rejects without creating an event", async () => {
    const result = await applyDecision({
      requestId: "req-1",
      decision: "reject",
      actor: ACTOR,
      note: "we already have a licence",
    });

    expect(result.request.status).toBe("rejected");
    expect(result.event).toBeNull();
    expect(mocks.insertEvent).not.toHaveBeenCalled();
    expect(mocks.appendTrail).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { note: "we already have a licence" } }),
      {},
    );
  });

  it("ignores the same decision arriving twice, so no second event is created", async () => {
    mocks.getRequestForUpdate.mockResolvedValue(stubRequest({ status: "event_created" }));

    const result = await applyDecision({ requestId: "req-1", decision: "approve", actor: ACTOR });

    expect(result.changed).toBe(false);
    expect(result.event).toBeNull();
    expect(mocks.insertEvent).not.toHaveBeenCalled();
    expect(mocks.appendTrail).not.toHaveBeenCalled();
  });

  it("refuses to reverse a decision that was already made", async () => {
    mocks.getRequestForUpdate.mockResolvedValue(stubRequest({ status: "event_created" }));

    await expect(
      applyDecision({ requestId: "req-1", decision: "reject", actor: ACTOR }),
    ).rejects.toThrow(InvalidTransition);
    expect(mocks.updateStatusAndCap).not.toHaveBeenCalled();
  });

  it.each(["guided", "needs_detail", "received"] as const)(
    "refuses a decision on a request that is %s",
    async (status) => {
      mocks.getRequestForUpdate.mockResolvedValue(stubRequest({ status }));

      await expect(
        applyDecision({ requestId: "req-1", decision: "approve", actor: ACTOR }),
      ).rejects.toThrow(InvalidTransition);
      expect(mocks.insertEvent).not.toHaveBeenCalled();
    },
  );

  it("reports an unknown request", async () => {
    mocks.getRequestForUpdate.mockResolvedValue(null);

    await expect(
      applyDecision({ requestId: "missing", decision: "approve", actor: ACTOR }),
    ).rejects.toThrow(RequestNotFound);
  });
});
