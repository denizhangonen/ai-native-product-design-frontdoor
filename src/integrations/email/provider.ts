import { getConfig } from "@/config";
import { fakeEmailProvider } from "@/integrations/email/providers/fake";
import { createResendProvider } from "@/integrations/email/providers/resend";

export type OutboundEmail = {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  text: string;
  /** The request this mail is about; what the log line carries instead of the subject. */
  reference: string | null;
  /** Extra headers, e.g. the auto-reply markers that stop a mailbox answering back. */
  headers?: Record<string, string>;
  /** Stable per message, so a retry cannot send the same mail twice. */
  idempotencyKey?: string;
};

export type EmailProvider = {
  name: string;
  send(email: OutboundEmail): Promise<void>;
};

export function getEmailProvider(): EmailProvider {
  const config = getConfig();
  switch (config.EMAIL_PROVIDER) {
    case "fake":
      return fakeEmailProvider;
    case "resend": {
      if (!config.RESEND_API_KEY) {
        throw new Error("Invalid environment configuration: RESEND_API_KEY");
      }
      return createResendProvider(config.RESEND_API_KEY);
    }
  }
}
