/**
 * Logs identify a recipient by domain only. Which company was mailed is useful
 * when something goes wrong; which person was mailed is not ours to keep.
 */
export function maskAddress(address: string): string {
  const at = address.lastIndexOf("@");
  if (at === -1) return "hidden";

  const domain = address.slice(at + 1).replace(/>$/, "").trim();
  return domain ? `***@${domain}` : "hidden";
}
