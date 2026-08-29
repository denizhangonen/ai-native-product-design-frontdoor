const API = "https://slack.com/api";
const TIMEOUT_MS = 5_000;

export class SlackApiError extends Error {
  constructor(method: string, reason: string) {
    super(`Slack ${method} failed: ${reason}`);
    this.name = "SlackApiError";
  }
}

// Slack answers 200 with { ok: false } on failure, so the body decides, not the status.
// Form encoding, because only some methods (chat.postMessage) accept JSON; all accept forms.
async function call<T>(
  method: string,
  botToken: string,
  body: Record<string, string | undefined>,
): Promise<T> {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) form.set(key, value);
  }

  const response = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const payload = (await response.json()) as { ok: boolean; error?: string } & T;
  if (!payload.ok) throw new SlackApiError(method, payload.error ?? "unknown error");
  return payload;
}

// Slack reads <!channel>, <@U...> and <url|label> inside text. Nothing this app posts
// may carry them, least of all words a person typed into a request.
function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type PostMessageInput = {
  botToken: string;
  channel: string;
  text: string;
  threadTs?: string;
};

export async function postMessage(input: PostMessageInput): Promise<void> {
  await call("chat.postMessage", input.botToken, {
    channel: input.channel,
    text: escapeText(input.text),
    thread_ts: input.threadTs,
  });
}

export async function getUserName(botToken: string, userId: string): Promise<string> {
  const payload = await call<{ user: { real_name?: string; name?: string } }>(
    "users.info",
    botToken,
    { user: userId },
  );
  return payload.user.real_name || payload.user.name || userId;
}
