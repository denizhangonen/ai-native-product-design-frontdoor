import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifyRequester } from "@/services/notifyRequester";
import { stubRequest } from "@/services/testSupport";

const mocks = vi.hoisted(() => ({
  getSlackConfig: vi.fn(),
  findSlackOrigin: vi.fn(),
  postMessage: vi.fn(),
}));

vi.mock("@/config", () => ({ getSlackConfig: mocks.getSlackConfig }));
vi.mock("@/data/inboundMessages", () => ({ findSlackOrigin: mocks.findSlackOrigin }));
vi.mock("@/integrations/slack/client", () => ({ postMessage: mocks.postMessage }));

const SLACK = { signingSecret: "s", botToken: "xoxb-not-a-real-token", channelId: "C_PURCHASING" };
const APPROVED = stubRequest({ status: "event_created" });

function text(): string {
  return mocks.postMessage.mock.calls[0][0].text;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSlackConfig.mockReturnValue(SLACK);
  mocks.findSlackOrigin.mockResolvedValue({ channelId: "C_PURCHASING", messageTs: "1699.0001" });
  mocks.postMessage.mockResolvedValue(undefined);
});

describe("notifyRequester", () => {
  it("replies in the thread where the requester asked", async () => {
    expect(await notifyRequester(APPROVED, "the fifth can share")).toBe("notified");

    expect(mocks.postMessage).toHaveBeenCalledWith({
      botToken: SLACK.botToken,
      channel: "C_PURCHASING",
      threadTs: "1699.0001",
      text:
        "Approved by procurement: Figma, 5 seats, $3,000/year.\nAn event has been created; procurement owns it from here.\nNote: the fifth can share",
    });
  });

  it("shows the capped figures and what was asked for", async () => {
    await notifyRequester({ ...APPROVED, cap: { quantity: 4, annualCents: null } }, null);

    expect(text()).toBe(
      "Approved by procurement, with a limit: Figma, 4 seats, $3,000/year (asked for 5 seats).\nAn event has been created; procurement owns it from here.",
    );
  });

  it("shows a budget cap as the approved yearly figure", async () => {
    await notifyRequester({ ...APPROVED, cap: { quantity: null, annualCents: 200_000 } }, null);

    expect(text()).toContain("Figma, 5 seats, $2,000/year (asked for $3,000/year)");
  });

  it("words a rejection plainly", async () => {
    await notifyRequester(stubRequest({ status: "rejected" }), "we already have a licence");

    expect(text()).toBe("Rejected by procurement: Figma, 5 seats, $3,000/year.\nNote: we already have a licence");
  });

  it("does nothing when Slack is not configured", async () => {
    mocks.getSlackConfig.mockReturnValue(null);

    expect(await notifyRequester(APPROVED, null)).toBe("slack_not_configured");
    expect(mocks.postMessage).not.toHaveBeenCalled();
  });

  it("reports a request that did not come from Slack", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.findSlackOrigin.mockResolvedValue(null);

    expect(await notifyRequester(APPROVED, null)).toBe("no_origin");
  });

  it("swallows a Slack failure, because the decision is already recorded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.postMessage.mockRejectedValue(new Error("slack is down"));

    await expect(notifyRequester(APPROVED, null)).resolves.toBe("failed");
  });
});
