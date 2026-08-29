const BLOCK =
  /<\/?(?:p|div|tr|li|h[1-6]|blockquote|table|ul|ol|section|article|header|footer)[^>]*>|<br\s*\/?>/gi;
const CELL_END = /<\/(?:td|th)>/gi;

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

/** Last resort for a reply that arrives without a plain text part. */
export function htmlToText(html: string): string {
  const stripped = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(BLOCK, "\n")
    .replace(CELL_END, " ")
    // Inline tags leave nothing behind, so a bold word is not split in two.
    .replace(/<[^>]*>/g, "");

  // Entities are decoded after the tags are gone, so an escaped tag stays text.
  const decoded = stripped.replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/gi, (match) => {
    return ENTITIES[match.toLowerCase()] ?? match;
  });

  return decoded
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
