import { db } from "@/data/db";
import { describeError } from "@/domain/errors";

export async function GET() {
  try {
    await db()`select 1`;
    return Response.json({ ok: true, db: true });
  } catch (error) {
    // Never the message: a driver error message can carry the connection string.
    console.error({ event: "health_check_failed", ...describeError(error) });
    return Response.json({ ok: false, db: false }, { status: 503 });
  }
}
