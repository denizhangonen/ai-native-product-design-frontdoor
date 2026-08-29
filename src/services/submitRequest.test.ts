import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidRequestInput } from "@/domain/errors";
import type { RequestStatus } from "@/domain/status";
import { type SubmitRequestInput, submitRequest } from "@/services/submitRequest";
import { stubRequest } from "@/services/testSupport";

const mocks = vi.hoisted(() => ({
  insertRequest: vi.fn(),
  updateStatus: vi.fn(),
  appendTrail: vi.fn(),
  begin: vi.fn(),
}));

vi.mock("@/config", () => ({
  getConfig: () => ({ DATABASE_URL: "x", POLICY_THRESHOLD_USD_PER_YEAR: 1000 }),
}));
vi.mock("@/data/db", () => ({ db: () => ({ begin: mocks.begin }) }));
vi.mock("@/data/requests", () => ({
  insertRequest: mocks.insertRequest,
  updateStatus: mocks.updateStatus,
}));
vi.mock("@/data/trail", () => ({ appendTrail: mocks.appendTrail }));

const VALID: SubmitRequestInput = {
  requester: { slackUserId: "U123", displayName: "Requester" },
  amountInMessage: true,
  item: "Figma",
  quantity: 5,
  unit: "seats",
  budget: { amountCents: 300_000, period: "annual", currency: "USD" },
  team: "Design",
  urgency: "this_month",
  reason: "the design team is growing",
  reading: { confidence: 0.95, rationale: "Stated plainly.", model: "fake" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.begin.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({}),
  );
  mocks.insertRequest.mockImplementation(
    async (input: {
      budget: SubmitRequestInput["budget"];
      reading: SubmitRequestInput["reading"];
      amountInMessage: boolean;
    }) =>
      stubRequest({
        budget: input.budget,
        reading: input.reading ?? null,
        amountInMessage: input.amountInMessage,
      }),
  );
  mocks.updateStatus.mockImplementation(async (_id: string, status: RequestStatus) =>
    stubRequest({ status }),
  );
  mocks.appendTrail.mockResolvedValue(undefined);
});

describe("submitRequest", () => {
  it("stores how the model read the message", async () => {
    await submitRequest(VALID);

    expect(mocks.insertRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "received",
        reading: { confidence: 0.95, rationale: "Stated plainly.", model: "fake" },
      }),
      expect.anything(),
    );
  });

  it("accepts a request with no reading, so the flow does not depend on one", async () => {
    const withoutReading = { ...VALID };
    delete withoutReading.reading;

    await submitRequest(withoutReading);

    expect(mocks.insertRequest).toHaveBeenCalledWith(
      expect.objectContaining({ reading: null }),
      expect.anything(),
    );
  });

  it("sends spend above the threshold to procurement", async () => {
    const { request, policy } = await submitRequest(VALID);

    expect(policy.route).toBe("procurement");
    expect(request.status).toBe("with_procurement");
    expect(mocks.updateStatus).toHaveBeenCalledWith("req-1", "with_procurement", {});
  });

  it("guides spend within the threshold without anyone involved", async () => {
    const small = { ...VALID, budget: { amountCents: 60_000, period: "annual" as const, currency: "USD" } };

    const { request, policy } = await submitRequest(small);

    expect(policy.route).toBe("guided");
    expect(request.status).toBe("guided");
    expect(mocks.updateStatus).toHaveBeenCalledWith("req-1", "guided", {});
  });

  it("fails closed on a budget in another currency", async () => {
    const euros = { ...VALID, budget: { amountCents: 100, period: "annual" as const, currency: "EUR" } };

    const { policy } = await submitRequest(euros);

    expect(policy.route).toBe("procurement");
    expect(policy.flags).toEqual(["currency_not_usd"]);
  });

  it("fails closed when the figure was not found in the message, and when unchecked", async () => {
    const unfound = { ...VALID, amountInMessage: false, budget: { amountCents: 100, period: "annual" as const, currency: "USD" } };
    expect((await submitRequest(unfound)).policy.flags).toEqual(["amount_not_in_message"]);

    const unchecked = { ...VALID, budget: unfound.budget };
    delete (unchecked as { amountInMessage?: boolean }).amountInMessage;
    expect((await submitRequest(unchecked)).policy.route).toBe("procurement");
  });

  it("fails closed on a budget with no currency", async () => {
    const bare = { ...VALID, budget: { amountCents: 100, period: "annual" as const, currency: null } };

    const { policy } = await submitRequest(bare);

    expect(policy.route).toBe("procurement");
    expect(policy.flags).toEqual(["currency_not_stated"]);
  });

  it("uppercases a lowercase currency code before it is stored", async () => {
    await submitRequest({ ...VALID, budget: { ...VALID.budget, currency: "usd" } });

    expect(mocks.insertRequest).toHaveBeenCalledWith(
      expect.objectContaining({ budget: expect.objectContaining({ currency: "USD" }) }),
      expect.anything(),
    );
  });

  it("records the creation and the routing on the trail", async () => {
    await submitRequest(VALID);

    const types = mocks.appendTrail.mock.calls.map(([entry]) => entry.type);
    expect(types).toEqual(["created", "routed"]);
    const [, routed] = mocks.appendTrail.mock.calls.map(([entry]) => entry);
    expect(routed.payload).toEqual(
      expect.objectContaining({ route: "procurement", flags: [], annualCents: 300_000 }),
    );
  });

  it("keeps the reading on the creation entry, so the page can show it later", async () => {
    await submitRequest(VALID);

    const [created] = mocks.appendTrail.mock.calls.map(([entry]) => entry);
    expect(created.type).toBe("created");
    expect(created.reading).toEqual(VALID.reading);
  });

  it("does all of its writes inside one transaction", async () => {
    await submitRequest(VALID);
    expect(mocks.begin).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an empty item", { item: "" }],
    ["a negative amount", { budget: { amountCents: -1, period: "annual", currency: "USD" } }],
    ["a fractional amount of cents", { budget: { amountCents: 1.5, period: "annual", currency: "USD" } }],
    ["a currency that is not a code", { budget: { amountCents: 100, period: "annual", currency: "dollars" } }],
    ["an empty reason", { reason: "" }],
    ["an unknown period", { budget: { amountCents: 100, period: "weekly", currency: "USD" } }],
    ["a quantity of zero", { quantity: 0 }],
    ["an urgency that is not in the list", { urgency: "yesterday" }],
    ["a missing requester id", { requester: { slackUserId: "", displayName: "Requester" } }],
  ])("rejects %s", async (_label, overrides) => {
    await expect(
      submitRequest({ ...VALID, ...overrides } as SubmitRequestInput),
    ).rejects.toThrow(InvalidRequestInput);
    expect(mocks.begin).not.toHaveBeenCalled();
  });

  it("names the offending field without echoing its value", async () => {
    const secretItem = "Very Confidential Tool Ltd";
    const bad = { ...VALID, item: secretItem, quantity: 0 };
    await expect(submitRequest(bad)).rejects.toThrow(/quantity/);
    await expect(submitRequest(bad)).rejects.not.toThrow(new RegExp(secretItem));
  });
});
