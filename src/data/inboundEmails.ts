import { type Executor, db } from "@/data/db";
import { type Intake, claimExisting, releaseClaim } from "@/data/intakeClaim";

export type InboundEmailRecord = {
  messageId: string;
  fromAddress: string;
  subject: string;
  reference: string | null;
};

/**
 * Stores a reply once and says whether this caller owns it. A redelivery that
 * arrives while the first attempt is still running must not decide anything twice.
 */
export async function recordInboundEmail(
  email: InboundEmailRecord,
  sql: Executor = db(),
): Promise<Intake> {
  const inserted = await sql`
    insert into inbound_emails (message_id, from_address, subject, reference)
    values (${email.messageId}, ${email.fromAddress}, ${email.subject}, ${email.reference})
    on conflict (message_id) do nothing
    returning id
  `;
  if (inserted.length > 0) return "new";

  return claimExisting("inbound_emails", email.messageId, sql);
}

/** How many replies one sender has sent about one request. The loop guard reads this. */
export async function countRepliesFrom(
  fromAddress: string,
  reference: string | null,
  sql: Executor = db(),
): Promise<number> {
  const [row] = await sql<{ count: string }[]>`
    select count(*) as count from inbound_emails
     where from_address = ${fromAddress} and reference is not distinct from ${reference}
  `;
  return Number(row?.count ?? 0);
}

export async function releaseInboundEmail(messageId: string, sql: Executor = db()): Promise<void> {
  await releaseClaim("inbound_emails", messageId, sql);
}

export async function markInboundEmailProcessed(
  messageId: string,
  sql: Executor = db(),
): Promise<void> {
  await sql`update inbound_emails set processed_at = now() where message_id = ${messageId}`;
}
