import { getProvider } from "@/ai/provider";
import type { CompletionTask } from "@/ai/provider";

const TIMEOUT_MS = 10_000;
// A purchase request or a decision is short. Anything longer is a quoted thread,
// a paste, or an attack, and sending it on would cost money for no benefit.
const MAX_INPUT_CHARS = 2_000;
const ATTEMPTS = 2;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("model timed out")), ms);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export type CompletionOutcome<T> =
  | { kind: "ok"; value: T; model: string }
  | { kind: "failed"; reason: string };

/**
 * One bounded, validated call to whichever model is configured. The caller's
 * `read` turns raw text into a typed value or null; a null gets one retry, because
 * a model returning almost-JSON once is common and cheap to redo.
 */
export async function completeValidated<T>(
  task: CompletionTask,
  system: string,
  user: string,
  read: (raw: string) => T | null,
): Promise<CompletionOutcome<T>> {
  const provider = getProvider();
  let value: T | null = null;

  for (let attempt = 0; attempt < ATTEMPTS && value === null; attempt += 1) {
    let raw: string;
    try {
      raw = await withTimeout(
        provider.complete({ task, system, user: user.slice(0, MAX_INPUT_CHARS) }),
        TIMEOUT_MS,
      );
    } catch (error) {
      return { kind: "failed", reason: (error as Error).message };
    }
    value = read(raw);
  }

  if (value === null) return { kind: "failed", reason: "model did not return valid JSON" };
  return { kind: "ok", value, model: provider.name };
}

export function readJson<T>(raw: string, parse: (payload: unknown) => T | null): T | null {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  return parse(payload);
}
