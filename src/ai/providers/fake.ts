import type { CompletionRequest, LlmProvider } from "@/ai/provider";
import { fakeDecision } from "@/ai/providers/fakeDecision";
import { extract } from "@/ai/providers/fakeExtraction";

/**
 * A stand-in for a model, so the whole flow can be exercised with no key and no
 * network. Fixtures are matched first, so a test can pin any answer it likes,
 * including malformed output.
 */
const fixtures = new Map<string, string>();

export function setFixture(message: string, response: string): void {
  fixtures.set(normalise(message), response);
}

export function clearFixtures(): void {
  fixtures.clear();
}

function normalise(message: string): string {
  return message.trim().toLowerCase().replace(/\s+/g, " ");
}

export const fakeProvider: LlmProvider = {
  name: "fake",
  async complete(request: CompletionRequest): Promise<string> {
    const fixture = fixtures.get(normalise(request.user));
    if (fixture !== undefined) return fixture;

    const answer =
      request.task === "parse_decision" ? fakeDecision(request.user) : extract(request.user);
    return JSON.stringify(answer);
  },
};
