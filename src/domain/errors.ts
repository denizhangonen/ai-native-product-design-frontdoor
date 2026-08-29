export class InvalidTransition extends Error {
  constructor(from: string, event: string) {
    super(`Cannot apply "${event}" to a request that is "${from}"`);
    this.name = "InvalidTransition";
  }
}

export class RequestNotFound extends Error {
  constructor(id: string) {
    super(`No request with id "${id}"`);
    this.name = "RequestNotFound";
  }
}

export class ModelUnavailable extends Error {
  constructor(reason: string) {
    super(`The model could not be reached: ${reason}`);
    this.name = "ModelUnavailable";
  }
}

// Errors whose messages are built by this codebase from codes, never from user or provider text.
const SAFE_MESSAGES = new Set([
  "InvalidTransition",
  "RequestNotFound",
  "InvalidRequestInput",
  "ModelUnavailable",
  "SlackApiError",
  "OpenAiError",
  "ResendApiError",
]);

/** What may be logged about an error: the name, a driver code, and a message only when it is ours. */
export function describeError(error: unknown): { name: string; code?: string; message?: string } {
  const named = error as { name?: string; code?: string; message?: string };
  const name = named?.name ?? "Error";
  return {
    name,
    ...(typeof named?.code === "string" ? { code: named.code } : {}),
    ...(SAFE_MESSAGES.has(name) && named.message ? { message: named.message } : {}),
  };
}

export class InvalidRequestInput extends Error {
  constructor(details: string) {
    super(`Request input is not valid: ${details}`);
    this.name = "InvalidRequestInput";
  }
}
