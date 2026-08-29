import { timingSafeEqual } from "node:crypto";
import { getConfig } from "@/config";
import { pruneUnlinkedMessages } from "@/data/inboundMessages";
import { describeError } from "@/domain/errors";

// A retry from Slack arrives within minutes; a month is generous and still bounded.
const KEEP_DAYS = 30;

function authorised(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Scheduled by Vercel (see vercel.json). Deletes inbound rows that never became a request. */
export async function GET(request: Request) {
  const secret = getConfig().CRON_SECRET;
  if (!secret || !authorised(request, secret)) {
    console.warn({ event: "cron_unauthorised" });
    return Response.json({ ok: false }, { status: 401 });
  }

  try {
    const deleted = await pruneUnlinkedMessages(KEEP_DAYS);
    console.info({ event: "inbound_pruned", deleted });
    return Response.json({ ok: true, deleted });
  } catch (error) {
    console.error({ event: "prune_failed", ...describeError(error) });
    return Response.json({ ok: false }, { status: 500 });
  }
}
