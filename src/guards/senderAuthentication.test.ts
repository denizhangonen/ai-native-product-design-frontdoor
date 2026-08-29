import { describe, expect, it } from "vitest";
import { checkSenderAuthentication } from "@/guards/senderAuthentication";

// Taken from a real delivery, trimmed.
const GENUINE =
  "amazonses.com; spf=pass (spfCheck: domain of send.frontdoor.example.com designates " +
  "54.240.3.14 as permitted sender) client-ip=54.240.3.14; dkim=pass header.i=@example.com; " +
  "dmarc=pass header.from=example.com";

const FROM = "procurement@example.com";

describe("checkSenderAuthentication", () => {
  it("accepts a genuine delivery", () => {
    expect(checkSenderAuthentication(GENUINE, FROM)).toBe("pass");
  });

  it("refuses a message whose sending domain disowns it", () => {
    expect(checkSenderAuthentication("amazonses.com; spf=fail; dkim=fail; dmarc=fail", FROM)).toBe("fail");
  });

  it("refuses on a DMARC failure even when SPF passed", () => {
    expect(checkSenderAuthentication("amazonses.com; spf=pass; dmarc=fail", FROM)).toBe("fail");
  });

  it("accepts a forwarded message when the signature for the From domain holds", () => {
    expect(checkSenderAuthentication("amazonses.com; spf=fail; dkim=pass header.i=@example.com", FROM)).toBe("pass");
    expect(checkSenderAuthentication("amazonses.com; dkim=pass header.d=mail.example.com", "pat@mail.example.com")).toBe("pass");
  });

  // The attacker's own domain signs and passes; the From header is still forged.
  it("refuses a valid signature for a different domain", () => {
    const forged = "amazonses.com; spf=pass smtp.mailfrom=attacker.example; dkim=pass header.i=@attacker.example; dmarc=none";
    expect(checkSenderAuthentication(forged, FROM)).toBe("fail");
  });

  it("does not let a look-alike domain align", () => {
    expect(checkSenderAuthentication("amazonses.com; dkim=pass header.d=notexample.com", FROM)).toBe("fail");
    expect(checkSenderAuthentication("amazonses.com; dkim=pass header.d=example.com.evil", FROM)).toBe("fail");
  });

  it("accepts an aligned envelope sender when there is no signature", () => {
    expect(checkSenderAuthentication("amazonses.com; spf=pass smtp.mailfrom=bounce@example.com", FROM)).toBe("pass");
  });

  it("reports an absent verdict as unknown rather than guessing either way", () => {
    expect(checkSenderAuthentication(null, FROM)).toBe("unknown");
    expect(checkSenderAuthentication("amazonses.com; something-else=yes", FROM)).toBe("unknown");
  });

  it("refuses a From that is not an address at all", () => {
    expect(checkSenderAuthentication(GENUINE, "")).toBe("fail");
  });

  it("is not fooled by a verdict word appearing inside another value", () => {
    expect(checkSenderAuthentication("amazonses.com; spf=passing-by", FROM)).toBe("unknown");
    expect(checkSenderAuthentication("header.from=dkim=fail.example.com", FROM)).toBe("unknown");
    expect(checkSenderAuthentication("x-note=dmarc=pass; nothing else", FROM)).toBe("unknown");
  });

  it("reads the verdict whatever its casing", () => {
    expect(checkSenderAuthentication("amazonses.com; DMARC=PASS", FROM)).toBe("pass");
  });
});
