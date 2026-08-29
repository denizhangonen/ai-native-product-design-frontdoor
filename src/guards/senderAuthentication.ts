export type SenderVerdict = "pass" | "fail" | "unknown";

/**
 * A From header is trivially forged, so the receiving mail server's own verdict
 * decides, and it must vouch for the From domain itself: a valid signature from the
 * attacker's own domain proves nothing about the address it claims to be from.
 */
export function checkSenderAuthentication(results: string | null, from: string): SenderVerdict {
  if (!results) return "unknown";
  const text = results.toLowerCase();
  const fromDomain = from.toLowerCase().split("@").pop() ?? "";
  if (!fromDomain) return "fail";

  // A mechanism starts a clause; "header.from=dkim=fail.example.com" is a value, not a verdict.
  const says = (mechanism: string, outcome: string) =>
    new RegExp(`(?:^|[;\\s])${mechanism}=${outcome}\\b`).test(text);
  const aligned = (domain: string) => domain === fromDomain || fromDomain.endsWith(`.${domain}`);

  // DMARC is exactly this check, done by the receiving server.
  if (says("dmarc", "pass")) return "pass";
  if (says("dmarc", "fail")) return "fail";

  // No DMARC verdict: accept a signature or an envelope for the From domain, nothing else.
  const dkimDomains = [...text.matchAll(/(?:^|[;\s])dkim=pass\b[^;]*?\bheader\.[di]=@?([a-z0-9.-]+)/g)].map((m) => m[1]);
  if (dkimDomains.some(aligned)) return "pass";
  const spfDomains = [...text.matchAll(/(?:^|[;\s])spf=pass\b[^;]*?\bsmtp\.mailfrom=(?:[^@\s]+@)?([a-z0-9.-]+)/g)].map((m) => m[1]);
  if (spfDomains.some(aligned)) return "pass";

  if (says("dkim", "fail") || says("spf", "fail") || says("dkim", "pass") || says("spf", "pass")) return "fail";
  return "unknown";
}
