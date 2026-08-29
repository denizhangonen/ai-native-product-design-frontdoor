import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidRequestInput } from "@/domain/errors";
import type { RequestStatus } from "@/domain/status";
import { type HoldForDetailInput, holdForDetail } from "@/services/holdForDetail";
import { stubRequest } from "@/services/testSupport";

const mocks = vi.hoisted(() => ({
  insertRequest: vi.fn(),
  updateStatus: vi.fn(),
  appendTrail: vi.fn(),
  begin: vi.fn(),
}));

vi.mock("@/data/db", () => ({ db: () => ({ begin: mocks.begin }) }));
vi.mock("@/data/requests", () => ({
  insertRequest: mocks.insertRequest,
  updateStatus: mocks.updateStatus,
}));
vi.mock("@/data/trail", () => ({ appendTrail: mocks.appendTrail }));

const PARTIAL: HoldForDetailInput = {
  requester: { slackUserId: "U123", displayName: "Requester" },
  amountInMessage: false,
  item: "Figma",
  quantity: 5,
  unit: "seats",
  budget: null,
  team: "Design",
  urgency: null,
  reason: null,
  missing: ["budget"],
  reading: { confidence: 0.8, rationale: "No figure was given.", model: "fake" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.begin.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({}),
  );
  mocks.insertRequest.mockImplementation(async (input: { reading: HoldForDetailInput["reading"] }) =>
    stubRequest({ budget: null, reading: input.reading ?? null }),
  );
  mocks.updateStatus.mockImplementation(async (_id: string, status: RequestStatus) =>
    stubRequest({ budget: null, status }),
  );
  mocks.appendTrail.mockResolvedValue(undefined);
});

describe("holdForDetail", () => {
  it("stores what was read and parks the request as needs_detail", async () => {
    const request = await holdForDetail(PARTIAL);

    expect(request.status).toBe("needs_detail");
    expect(mocks.insertRequest).toHaveBeenCalledWith(
      expect.objectContaining({ item: "Figma", budget: null, status: "received" }),
      expect.anything(),
    );
    expect(mocks.updateStatus).toHaveBeenCalledWith("req-1", "needs_detail", {});
  });

  it("records what is missing on the trail, without the message itself", async () => {
    await holdForDetail(PARTIAL);

    const entries = mocks.appendTrail.mock.calls.map(([entry]) => entry);
    expect(entries.map((entry) => entry.type)).toEqual(["created", "detail_requested"]);
    expect(entries[1].payload).toEqual({ missing: ["budget"] });
  });

  it("can hold a request with nothing but a reading", async () => {
    await holdForDetail({ ...PARTIAL, item: null, quantity: null, unit: null, missing: ["item", "budget"] });

    expect(mocks.begin).toHaveBeenCalledTimes(1);
  });

  it("keeps the reading on the creation entry", async () => {
    await holdForDetail(PARTIAL);

    const [created] = mocks.appendTrail.mock.calls.map(([entry]) => entry);
    expect(created.reading).toEqual(PARTIAL.reading);
  });

  it.each([
    ["missing nothing", { missing: [] }],
    ["a budget that is present but listed as missing", { budget: { amountCents: 1, period: null, currency: null } }],
    ["an item that is absent but not listed", { item: null }],
  ])("refuses to hold a request with %s", async (_label, overrides) => {
    await expect(
      holdForDetail({ ...PARTIAL, ...overrides } as HoldForDetailInput),
    ).rejects.toThrow(InvalidRequestInput);
    expect(mocks.begin).not.toHaveBeenCalled();
  });
});
