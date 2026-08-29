const REFERENCE = /\b(PI-\d+)\b/;

/** The reference travels in the subject, which every mail client keeps on a reply. */
export function extractReference(subject: string): string | null {
  const match = subject.match(REFERENCE);
  return match ? match[1] : null;
}

// Where each mail client starts quoting the message being replied to.
const QUOTE_MARKERS = [
  /^\s*On .+ wrote:\s*$/im, // Gmail, Apple Mail
  /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im, // Outlook, older clients
  /^\s*_{5,}\s*$/m, // Outlook divider
  /^\s*From:\s.+$/im, // Outlook header block
  /^\s*Sent from my \w+/im, // phone signatures that precede a quote
  /^\s*>{1,}/m, // plain text quoting
];

const SIGNATURE = /^--\s*$/m;

/**
 * Keeps only what the person actually typed. Everything from the first quote
 * marker or signature delimiter onwards belongs to the previous message.
 */
export function stripQuotedText(body: string): string {
  const normalised = body.replace(/\r\n/g, "\n");

  let cut = normalised.length;
  for (const marker of [...QUOTE_MARKERS, SIGNATURE]) {
    const match = normalised.match(marker);
    if (match?.index !== undefined && match.index < cut) cut = match.index;
  }

  const kept = normalised.slice(0, cut).trim();
  if (kept) return kept;

  // A marker matched the opening line, e.g. a reply that starts "From: my side, approved".
  // Falling back to the first written line beats handing the model nothing at all.
  const firstLine = normalised
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith(">"));

  return firstLine ?? "";
}
