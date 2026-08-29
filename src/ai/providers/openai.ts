import type { CompletionRequest, LlmProvider } from "@/ai/provider";

const API = "https://api.openai.com/v1/chat/completions";
const TIMEOUT_MS = 10_000;
// Small and cheap on purpose: the prompts are short and the answers are tiny JSON.
const MAX_OUTPUT_TOKENS = 200;

export class OpenAiError extends Error {
  constructor(status: number, code: string) {
    super(`OpenAI request failed: ${status} ${code}`);
    this.name = "OpenAiError";
  }
}

export type OpenAiOptions = {
  apiKey: string;
  model: string;
};

export function createOpenAiProvider(options: OpenAiOptions): LlmProvider {
  return {
    name: `openai:${options.model}`,
    async complete(request: CompletionRequest): Promise<string> {
      const response = await fetch(API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: options.model,
          temperature: 0,
          max_tokens: MAX_OUTPUT_TOKENS,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!response.ok) {
        // Code only: the error body can echo the request, which carries purchase detail.
        const body = (await response.json().catch(() => ({}))) as {
          error?: { code?: string; type?: string };
        };
        throw new OpenAiError(response.status, body.error?.code ?? body.error?.type ?? "unknown");
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      console.info({
        event: "llm_call",
        task: request.task,
        model: options.model,
        promptTokens: payload.usage?.prompt_tokens,
        completionTokens: payload.usage?.completion_tokens,
      });

      return payload.choices?.[0]?.message?.content ?? "";
    },
  };
}
