import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/prune/route";

const mocks = vi.hoisted(() => ({ getConfig: vi.fn(), pruneUnlinkedMessages: vi.fn() }));

vi.mock("@/config", () => ({ getConfig: mocks.getConfig }));
vi.mock("@/data/inboundMessages", () => ({ pruneUnlinkedMessages: mocks.pruneUnlinkedMessages }));

function call(authorization?: string) {
  return GET(
    new Request("https://example.com/api/cron/prune", {
      headers: authorization ? { authorization } : {},
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.getConfig.mockReturnValue({ CRON_SECRET: "cron-secret" });
  mocks.pruneUnlinkedMessages.mockResolvedValue(3);
});

describe("GET /api/cron/prune", () => {
  it("prunes when Vercel presents the secret", async () => {
    const response = await call("Bearer cron-secret");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, deleted: 3 });
    expect(mocks.pruneUnlinkedMessages).toHaveBeenCalledWith(30);
  });

  it.each([
    ["no header", undefined],
    ["the wrong secret", "Bearer nope"],
    ["a secret of the same length but different", "Bearer cron-secreT"],
  ])("refuses %s", async (_label, header) => {
    expect((await call(header)).status).toBe(401);
    expect(mocks.pruneUnlinkedMessages).not.toHaveBeenCalled();
  });

  it("refuses everyone when no secret is configured", async () => {
    mocks.getConfig.mockReturnValue({ CRON_SECRET: undefined });

    expect((await call("Bearer ")).status).toBe(401);
  });
});
