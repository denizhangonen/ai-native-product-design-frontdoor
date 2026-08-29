import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAiError, createOpenAiProvider } from "@/ai/providers/openai";

const provider = createOpenAiProvider({
  apiKey: "sk-not-a-real-key",
  model: "test-model",
});
const REQUEST = {
  task: "parse_request" as const,
  system: "sys",
  user: "2 more days for Meridian Supply on RFP-2041",
};

function respond(status: number, payload: unknown) {
  return vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => payload });
}

afterEach(() => vi.unstubAllGlobals());

describe("openai provider", () => {
  it("asks for JSON, at temperature zero, with a small output cap", async () => {
    const fetchMock = respond(200, {
      choices: [{ message: { content: "{}" } }],
    });
    vi.stubGlobal("fetch", fetchMock);

    await provider.complete(REQUEST);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      model: "test-model",
      temperature: 0,
      max_tokens: 200,
      response_format: { type: "json_object" },
    });
    expect(body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "2 more days for Meridian Supply on RFP-2041" },
    ]);
  });

  it("returns the model's text unchanged for the caller to validate", async () => {
    vi.stubGlobal("fetch", respond(200, { choices: [{ message: { content: '{"a":1}' } }] }));
    expect(await provider.complete(REQUEST)).toBe('{"a":1}');
  });

  it("returns empty rather than crashing when the answer has no content", async () => {
    vi.stubGlobal("fetch", respond(200, { choices: [] }));
    expect(await provider.complete(REQUEST)).toBe("");
  });

  it("fails loudly with the status and code on an API error", async () => {
    vi.stubGlobal("fetch", respond(429, { error: { code: "rate_limit_exceeded" } }));
    await expect(provider.complete(REQUEST)).rejects.toThrow(OpenAiError);
    await expect(provider.complete(REQUEST)).rejects.toThrow(/429 rate_limit_exceeded/);
  });

  it("never puts the key anywhere but the Authorization header", async () => {
    const fetchMock = respond(200, {
      choices: [{ message: { content: "{}" } }],
    });
    vi.stubGlobal("fetch", fetchMock);

    await provider.complete(REQUEST);

    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer sk-not-a-real-key",
    });
    expect((init as RequestInit).body as string).not.toContain("sk-not-a-real-key");
  });
});
