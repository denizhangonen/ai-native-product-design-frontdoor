import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/data/db";
import { getEventForRequest } from "@/data/events";
import { getRequest } from "@/data/requests";
import { listTrail } from "@/data/trail";
import { applyDecision } from "@/services/applyDecision";
import { completeRequest } from "@/services/completeRequest";
import { holdForDetail } from "@/services/holdForDetail";
import { submitRequest } from "@/services/submitRequest";

// Runs the real SQL against the database in DATABASE_URL. Off by default: LIVE_DB=1 turns it on.
const live = Boolean(process.env.LIVE_DB && process.env.DATABASE_URL);

const REQUESTER = { slackUserId: "U_LIVE_TEST", displayName: "Live Test" };
const created: string[] = [];

afterAll(async () => {
  if (!live) return;
  for (const id of created) await db()`delete from requests where id = ${id}`;
  await db().end();
});

describe.skipIf(!live)("the flow against the real database", () => {
  it("guides a small request with nobody involved", async () => {
    const { request, policy } = await submitRequest({
      requester: REQUESTER,
      amountInMessage: true,
      item: "Live test notebook",
      quantity: 2,
      unit: "units",
      budget: { amountCents: 4_000, period: "one_off", currency: "USD" },
      team: null,
      urgency: null,
      reason: null,
      reading: { confidence: 0.9, rationale: "live", model: "live" },
    });
    created.push(request.id);

    expect(policy.route).toBe("guided");
    expect(request.reference).toMatch(/^PI-\d{4,}$/);
    const trail = await listTrail(request.id);
    expect(trail.map((entry) => entry.type)).toEqual(["created", "guided"]);
  });

  it("holds, completes, routes, and approves with a cap, creating one event", async () => {
    const held = await holdForDetail({
      requester: REQUESTER,
      amountInMessage: false,
      item: "Live test seats",
      quantity: 5,
      unit: "seats",
      budget: null,
      team: "Design",
      urgency: "this_month",
      reason: null,
      missing: ["budget"],
      reading: { confidence: 0.8, rationale: "live", model: "live" },
    });
    created.push(held.id);
    expect(held.status).toBe("needs_detail");
    expect(held.budget).toBeNull();

    const { request, policy } = await completeRequest({
      requestId: held.id,
      amountInMessage: true,
      item: "Live test seats",
      quantity: 5,
      unit: "seats",
      budget: { amountCents: 300_000, period: "annual", currency: "USD" },
      team: "Design",
      urgency: "this_month",
      reason: null,
      reading: { confidence: 0.9, rationale: "live", model: "live" },
    });
    expect(policy.route).toBe("procurement");
    expect(request.status).toBe("with_procurement");

    const first = await applyDecision({
      requestId: request.id,
      decision: "approve",
      actor: "procurement@example.com",
      cap: { quantity: 4, annualCents: null },
      note: "cap at 4",
      reading: { confidence: 0.95, model: "live" },
    });
    expect(first.changed).toBe(true);
    expect(first.event?.quantity).toBe(4);

    const replay = await applyDecision({
      requestId: request.id,
      decision: "approve",
      actor: "procurement@example.com",
    });
    expect(replay.changed).toBe(false);

    const stored = await getRequest(request.id);
    expect(stored?.status).toBe("event_created");
    expect(stored?.cap).toEqual({ quantity: 4, annualCents: null });
    expect((await getEventForRequest(request.id))?.budget.amountCents).toBe(300_000);

    const trail = await listTrail(request.id);
    expect(trail.map((entry) => entry.type)).toEqual([
      "created",
      "detail_requested",
      "detail_received",
      "routed",
      "procurement_approved",
    ]);
    expect(trail.at(-1)?.reading).toEqual({ confidence: 0.95, model: "live" });
  });

  it("refuses an incomplete row once routed, at the database", async () => {
    await expect(
      db()`insert into requests (slack_user_id, requester_name, status) values ('U_LIVE_TEST', 'Live Test', 'guided')`,
    ).rejects.toThrow(/requests_complete_once_routed/);
  });
});
