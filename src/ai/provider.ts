import { getConfig } from "@/config";
import { fakeProvider } from "@/ai/providers/fake";
import { createOpenAiProvider } from "@/ai/providers/openai";

/** What the call is for. Real providers ignore it; it labels logs and lets the fake answer. */
export type CompletionTask = "parse_request" | "parse_decision";

export type CompletionRequest = {
  task: CompletionTask;
  system: string;
  user: string;
};

/**
 * The whole surface the rest of the app knows about a model: text in, text out.
 * Validation of that text happens in the caller, never here.
 */
export type LlmProvider = {
  name: string;
  complete(request: CompletionRequest): Promise<string>;
};

let openai: LlmProvider | undefined;

export function getProvider(): LlmProvider {
  const config = getConfig();
  switch (config.LLM_PROVIDER) {
    case "fake":
      return fakeProvider;
    case "openai": {
      if (!config.OPENAI_API_KEY)
        throw new Error("LLM_PROVIDER is openai but OPENAI_API_KEY is not set");
      openai ??= createOpenAiProvider({
        apiKey: config.OPENAI_API_KEY,
        model: config.OPENAI_MODEL,
      });
      return openai;
    }
  }
}
