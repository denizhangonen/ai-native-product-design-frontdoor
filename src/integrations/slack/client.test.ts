import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SlackApiError, getUserName, postMessage } from "@/integrations/slack/client";

const TOKEN = "xoxb-not-a-real-token";

function respondWith(payload: unknown) {
  return vi.fn().mockResolvedValue({ json: async () => payload } as Response);
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("postMessage", () => {
  it("posts into the thread with the bot token", async () => {
    const fetchMock = respondWith({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await postMessage({
      botToken: TOKEN,
      channel: "C1",
      text: "hello",
      threadTs: "123.45",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
    });
    const sent = Object.fromEntries((init as RequestInit).body as URLSearchParams);
    expect(sent).toEqual({ channel: "C1", text: "hello", thread_ts: "123.45" });
  });

  // A request can carry "<!channel>" or a disguised link; the bot must never post it live.
  it("escapes Slack markup so nothing a person typed can address the channel", async () => {
    const fetchMock = respondWith({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await postMessage({ botToken: TOKEN, channel: "C1", text: "Understood: <!channel> & <https://evil.example|Figma>" });

    const sent = Object.fromEntries((fetchMock.mock.calls[0][1] as RequestInit).body as URLSearchParams);
    expect(sent.text).toBe("Understood: &lt;!channel&gt; &amp; &lt;https://evil.example|Figma&gt;");
  });

  // Slack reports most failures with HTTP 200 and ok:false.
  it("treats ok:false as a failure even though the status is 200", async () => {
    vi.stubGlobal("fetch", respondWith({ ok: false, error: "channel_not_found" }));

    await expect(postMessage({ botToken: TOKEN, channel: "C1", text: "hi" })).rejects.toThrow(
      SlackApiError,
    );
  });

  it("names the Slack error so a failure is diagnosable", async () => {
    vi.stubGlobal("fetch", respondWith({ ok: false, error: "invalid_auth" }));

    await expect(postMessage({ botToken: TOKEN, channel: "C1", text: "hi" })).rejects.toThrow(
      /invalid_auth/,
    );
  });
});

// users.info rejects JSON bodies, which is how the first live request lost its name.
describe("encoding", () => {
  it("sends every call form-encoded, never as JSON", async () => {
    const fetchMock = respondWith({ ok: true, user: {} });
    vi.stubGlobal("fetch", fetchMock);

    await getUserName(TOKEN, "U1");

    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect((init as RequestInit).body).toBeInstanceOf(URLSearchParams);
  });

  it("leaves optional fields out instead of sending the word undefined", async () => {
    const fetchMock = respondWith({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await postMessage({ botToken: TOKEN, channel: "C1", text: "hi" });

    const sent = Object.fromEntries(fetchMock.mock.calls[0][1].body as URLSearchParams);
    expect(sent).not.toHaveProperty("thread_ts");
  });
});

describe("getUserName", () => {
  it.each([
    ["the real name when present", { real_name: "Dee Rep", name: "dee" }, "Dee Rep"],
    ["the handle when there is no real name", { name: "dee" }, "dee"],
    ["the id when Slack knows neither", {}, "U1"],
  ])("returns %s", async (_label, user, expected) => {
    vi.stubGlobal("fetch", respondWith({ ok: true, user }));
    expect(await getUserName(TOKEN, "U1")).toBe(expected);
  });

  it("fails loudly when the user cannot be read", async () => {
    vi.stubGlobal("fetch", respondWith({ ok: false, error: "user_not_found" }));
    await expect(getUserName(TOKEN, "U1")).rejects.toThrow(SlackApiError);
  });
});
