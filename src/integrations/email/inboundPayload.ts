import { z } from "zod";

/** What our own relay posts when EMAIL_PROVIDER is fake. */
export const selfSignedPayloadSchema = z.object({
  messageId: z.string().min(1),
  from: z.string().min(1),
  subject: z.string(),
  body: z.string(),
});

export const RECEIVED_EVENT = "email.received";

export const resendEventSchema = z.object({
  type: z.string().min(1),
  data: z.object({
    email_id: z.string().min(1),
    from: z.string().min(1),
    to: z.array(z.string()).default([]),
    cc: z.array(z.string()).default([]),
    subject: z.string().default(""),
  }),
});

