import { beforeEach, describe, expect, it, vi } from "vitest";
import { announceRouting } from "@/services/announceRouting";
import { stubRequest } from "@/services/testSupport";

const mocks = vi.hoisted(() => ({ postMessage: vi.fn(), sendBrief: vi.fn(), appendTrail: vi.fn(), begin: vi.fn() }));

vi.mock("@/config", () => ({ getConfig: () => ({ POLICY_URL: "https://example.com/policy" }) }));
vi.mock("@/integrations/slack/client", () => ({ postMessage: mocks.postMessage }));
vi.mock("@/integrations/email/send", () => ({ sendBrief: mocks.sendBrief }));
vi.mock("@/data/db", () => ({ db: () => ({ begin: mocks.begin }) }));
vi.mock("@/data/trail", () => ({ appendTrail: mocks.appendTrail }));

const SLACK = { signingSecret: "s", botToken: "xoxb-not-a-real-token", channelId: "C1" };
const THREAD = { channelId: "C1", threadTs: "1.1" };
const GUIDED = { route: "guided" as const, reason: "within", flags: [] };
const PROCUREMENT = { route: "procurement" as const, reason: "above", flags: [] };

function text(): string {
  return mocks.postMessage.mock.calls[0][0].text;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.postMessage.mockResolvedValue(undefined);
  mocks.sendBrief.mockResolvedValue(undefined);
  mocks.begin.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work({}));
  mocks.appendTrail.mockResolvedValue(undefined);
});

describe("announceRouting", () => {
  it("posts into the requester's thread, and sends no brief for a guided request", async () => {
    const result = await announceRouting(SLACK, THREAD, stubRequest({ status: "guided" }), GUIDED);

    expect(result).toBe("announced");
    expect(mocks.postMessage).toHaveBeenCalledWith(expect.objectContaining({ channel: "C1", threadTs: "1.1" }));
    expect(mocks.sendBrief).not.toHaveBeenCalled();
  });

  it("sends the brief before telling the requester it is with procurement", async () => {
    const request = stubRequest({ status: "with_procurement" });

    await announceRouting(SLACK, THREAD, request, PROCUREMENT);

    expect(mocks.sendBrief).toHaveBeenCalledWith(request, PROCUREMENT);
    expect(text()).toContain("Routing to procurement with a brief");
  });

  it("writes a failed brief on the trail and says so, instead of claiming procurement was told", async () => {
    mocks.sendBrief.mockRejectedValue(new Error("mail is down"));

    const result = await announceRouting(SLACK, THREAD, stubRequest({ status: "with_procurement" }), PROCUREMENT);

    expect(result).toBe("announced");
    expect(mocks.appendTrail).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "req-1", type: "brief_failed" }),
      {},
    );
    expect(text()).toContain("The brief could not be sent");
    expect(text()).not.toContain("Routing to procurement with a brief");
  });

  it("reports a Slack failure instead of throwing: the request is already saved", async () => {
    mocks.postMessage.mockRejectedValue(new Error("invalid_auth"));

    const result = await announceRouting(SLACK, THREAD, stubRequest({ status: "guided" }), GUIDED);

    expect(result).toBe("failed");
    expect(console.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "announce_failed", reference: "PI-1001" }),
    );
  });

  it("refuses to announce a request that is not complete", async () => {
    await expect(
      announceRouting(SLACK, THREAD, stubRequest({ status: "needs_detail", budget: null }), GUIDED),
    ).rejects.toThrow(/not complete/);
  });
});
