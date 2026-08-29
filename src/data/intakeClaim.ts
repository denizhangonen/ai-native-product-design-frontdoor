import type { Executor } from "@/data/db";

/**
 * "new" and "retry" mean the caller holds the delivery and should do the work.
 * "in_flight" means another attempt is still running; "duplicate" means one
 * already finished. Both of those mean: do nothing.
 */
export type Intake = "new" | "retry" | "duplicate" | "in_flight";

/**
 * How long an attempt may hold a delivery before another may take it over. Longer
 * than any single run can last, so a slow attempt is never mistaken for a dead one.
 */
const CLAIM_LEASE_SECONDS = 120;

export type ClaimTable = "inbound_messages" | "inbound_emails";

const KEY_COLUMN: Record<ClaimTable, string> = {
  inbound_messages: "event_id",
  inbound_emails: "message_id",
};

/**
 * Gives a delivery back after a failed attempt, so the provider's next retry takes it
 * over at once instead of waiting out a lease that nothing is using.
 */
export async function releaseClaim(table: ClaimTable, key: string, sql: Executor): Promise<void> {
  await sql`
    update ${sql(table)} set claimed_at = 'epoch'
     where ${sql(KEY_COLUMN[table])} = ${key} and processed_at is null
  `;
}

/**
 * Decides what a repeat delivery is, in one atomic step. The update either takes
 * the lease or returns nothing, so two deliveries racing cannot both win it.
 */
export async function claimExisting(
  table: ClaimTable,
  key: string,
  sql: Executor,
): Promise<Intake> {
  const keyColumn = KEY_COLUMN[table];

  const claimed = await sql`
    update ${sql(table)}
       set claimed_at = now()
     where ${sql(keyColumn)} = ${key}
       and processed_at is null
       and claimed_at < now() - ${`${CLAIM_LEASE_SECONDS} seconds`}::interval
    returning id
  `;
  if (claimed.length > 0) return "retry";

  const [existing] = await sql<{ processed_at: Date | null }[]>`
    select processed_at from ${sql(table)} where ${sql(keyColumn)} = ${key}
  `;
  return existing?.processed_at ? "duplicate" : "in_flight";
}
