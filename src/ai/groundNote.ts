// Words only, so punctuation and spacing differences do not hide a genuine quote.
const NOISE = /[^a-z0-9%]+/g;

function flatten(text: string): string {
  return text.toLowerCase().replace(NOISE, " ").trim();
}

/**
 * Keeps a note only when the reply actually contains it. The model may quote
 * procurement, never speak for them: an invented condition would be passed to the
 * requester as though procurement had written it.
 */
export function quotedNote(note: string | null, reply: string): string | null {
  if (!note) return null;
  return flatten(reply).includes(flatten(note)) ? note : null;
}
