import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidRequestInput, InvalidTransition, RequestNotFound } from "@/domain/errors";
import type { RequestStatus } from "@/domain/status";
import { type CompleteRequestInput, completeRequest, mergeFields } from "@/services/completeRequest";
import { stubRequest } from "@/services/testSupport";

const mocks = vi.hoisted(() => ({
  getRequestForUpdate: vi.fn(),
  updateFields: vi.fn(),
  updateStatus: vi.fn(),
  appendTrail: vi.fn(),
  begin: vi.fn(),
}));

vi.mock("@/config", () => ({
  getConfig: () => ({ DATABASE_URL: "x", POLICY_THRESHOLD_USD_PER_YEAR: 1000 }),
}));
vi.mock("@/data/db", () => ({ db: () => ({ begin: mocks.begin }) }));
vi.mock("@/data/requests", () => ({
  getRequestForUpdate: mocks.getRequestForUpdate,
  updateFields: mocks.updateFields,
  updateStatus: mocks.updateStatus,
}));
vi.mock("@/data/trail", () => ({ appendTrail: mocks.appendTrail }));

const ANSWER: CompleteRequestInput = {
  requestId: "req-1",
  item: "Figma",
  quantity: 5,
  unit: "seats",
  budget: { amountCents: 300_000, period: "annual", currency: "USD" },
  team: "Design",
  urgency: null,
  reason: null,
  reading: { confidence: 0.9, rationale: "The follow-up gave the yearly figure.", model: "fake" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.begin.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({}),
  );
  mocks.getRequestForUpdate.mockResolvedValue(stubRequest({ status: "needs_detail", budget: null }));
  mocks.updateFields.mockImplementation(async (_id: string, fields) =>
    stubRequest({ status: "needs_detail", ...fields }),
  );
  mocks.updateStatus.mockImplementation(async (_id: string, status: RequestStatus) =>
    stubRequest({ status }),
  );
  mocks.appendTrail.mockResolvedValue(undefined);
});

describe("completeRequest", () => {
  it("fills the request in under a row lock and routes it", async () => {
    const { request, policy } = await completeRequest(ANSWER);

    expect(mocks.getRequestForUpdate).toHaveBeenCalledWith("req-1", {});
    expect(mocks.updateFields).toHaveBeenCalledWith(
      "req-1",
      expect.objectContaining({ item: "Figma", budget: ANSWER.budget }),
      ANSWER.reading,
      {},
    );
    expect(policy.route).toBe("procurement");
    expect(request.status).toBe("with_procurement");
  });

  it("records the second reading on the trail as detail_received", async () => {
    await completeRequest(ANSWER);

    const entries = mocks.appendTrail.mock.calls.map(([entry]) => entry);
    expect(entries.map((entry) => entry.type)).toEqual(["detail_received", "routed"]);
    expect(entries[0].actor).toBe("U123");
  });

  it("refuses to fill in a request that is not waiting for detail", async () => {
    mocks.getRequestForUpdate.mockResolvedValue(stubRequest({ status: "with_procurement" }));

    await expect(completeRequest(ANSWER)).rejects.toThrow(InvalidTransition);
    expect(mocks.updateFields).not.toHaveBeenCalled();
  });

  it("reports an unknown request", async () => {
    mocks.getRequestForUpdate.mockResolvedValue(null);

    await expect(completeRequest(ANSWER)).rejects.toThrow(RequestNotFound);
  });

  it("keeps what the first message said when the follow-up only adds the budget", async () => {
    mocks.getRequestForUpdate.mockResolvedValue(
      stubRequest({ status: "needs_detail", budget: null, quantity: 5, unit: "seats", team: "Design" }),
    );

    await completeRequest({
      ...ANSWER,
      item: null,
      quantity: null,
      unit: null,
      team: null,
    });

    expect(mocks.updateFields).toHaveBeenCalledWith(
      "req-1",
      expect.objectContaining({ item: "Figma", quantity: 5, unit: "seats", team: "Design", budget: ANSWER.budget }),
      ANSWER.reading,
      {},
    );
  });

  it("keeps the first message's grounding when the follow-up brings no budget", () => {
    const existing = stubRequest({ amountInMessage: false });
    const answer = { ...stubRequest(), amountInMessage: true, budget: null };
    expect(mergeFields(existing, answer).amountInMessage).toBe(false);
  });

  it("refuses an answer that still leaves no budget", async () => {
    mocks.getRequestForUpdate.mockResolvedValue(stubRequest({ status: "needs_detail", budget: null }));

    await expect(completeRequest({ ...ANSWER, budget: null })).rejects.toThrow(InvalidRequestInput);
    expect(mocks.updateFields).not.toHaveBeenCalled();
  });
});

describe("mergeFields", () => {
  it("lets the follow-up override what it restates and keeps the rest", () => {
    const existing = stubRequest({ quantity: 5, unit: "seats", team: "Design", budget: null });
    const answer = {
      amountInMessage: true,
      item: null,
      quantity: 6,
      unit: null,
      budget: { amountCents: 100, period: null, currency: null },
      team: null,
      urgency: "this_week" as const,
      reason: null,
    };

    expect(mergeFields(existing, answer)).toEqual({
      amountInMessage: true,
      item: "Figma",
      quantity: 6,
      unit: "seats",
      budget: { amountCents: 100, period: null, currency: null },
      team: "Design",
      urgency: "this_week",
      reason: "the design team is growing",
    });
  });
});
