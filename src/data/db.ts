import postgres from "postgres";
import type { ISql, Sql } from "postgres";
import { getConfig } from "@/config";

/** A pool or an open transaction. Data functions accept either. */
export type Executor = ISql;

/** The most rows any list query returns, whatever it is asked for. */
export const MAX_LIST_LIMIT = 200;

let client: Sql | undefined;

export function db(): Sql {
  if (!client) {
    client = postgres(getConfig().DATABASE_URL, {
      max: 1,
      // Supabase transaction pooler cannot use prepared statements.
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
      // Also set on the frontdoor_app role; stated here so the schema is visible in code.
      connection: { search_path: "frontdoor" },
    });
  }
  return client;
}
