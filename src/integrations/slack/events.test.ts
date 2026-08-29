import { describe, expect, it } from "vitest";
import { classifyDelivery } from "@/integrations/slack/events";

const CHANNEL = "C_PURCHASING";

function delivery(event: Record<string, unknown>) {
  return {
    type: "event_callback",
    event_id: "Ev123",
    team_id: "T1",
    event: {
      type: "message",
      channel: CHANNEL,
      user: "U1",
      ts: "1699999999.000100",
      ...event,
    },
  };
}

describe("classifyDelivery", () => {
  it("answers the url verification challenge", () => {
    const result = classifyDelivery(
      { type: "url_verification", challenge: "abc123", token: "legacy" },
      CHANNEL,
    );
    expect(result).toEqual({ kind: "challenge", challenge: "abc123" });
  });

  it("accepts a plain message from a person", () => {
    const result = classifyDelivery(delivery({ text: "  Need Figma, 5 seats, $3k/year  " }), CHANNEL);

    expect(result).toEqual({
      kind: "message",
      message: {
        eventId: "Ev123",
        channelId: CHANNEL,
        slackUserId: "U1",
        messageTs: "1699999999.000100",
        threadTs: null,
        text: "Need Figma, 5 seats, $3k/year",
      },
    });
  });

  // Episode 1 dropped these as conversation. Here a reply is how a request gets completed.
  it("accepts a reply inside a thread and says which thread", () => {
    const result = classifyDelivery(
      delivery({ text: "about $3k a year", thread_ts: "1699999999.000001" }),
      CHANNEL,
    );

    expect(result.kind).toBe("message");
    expect(result.kind === "message" && result.message.threadTs).toBe("1699999999.000001");
  });

  it("treats a thread's opening message as top-level, not as a reply to itself", () => {
    const result = classifyDelivery(
      delivery({ text: "Need Figma, $3k/year", thread_ts: "1699999999.000100" }),
      CHANNEL,
    );

    expect(result.kind === "message" && result.message.threadTs).toBeNull();
  });

  it.each([
    ["a message with a file attached", { text: "Need Figma, $3k/year, quote attached", subtype: "file_share" }],
    ["a reply also sent to the channel", { text: "$3k a year", subtype: "thread_broadcast", thread_ts: "1699999999.000001" }],
  ])("still reads %s as a person asking", (_label, event) => {
    expect(classifyDelivery(delivery(event), CHANNEL).kind).toBe("message");
  });

  it.each([
    ["a message from a bot", { text: "hello", bot_id: "B1" }],
    ["an edited message", { text: "hello", subtype: "message_changed" }],
    ["a channel join notice", { text: "joined", subtype: "channel_join" }],
    ["a message in another channel", { text: "hello", channel: "C_RANDOM" }],
    ["a message with no text", { text: "   " }],
    ["a message with no author", { text: "hello", user: undefined }],
  ])("ignores %s", (_label, event) => {
    expect(classifyDelivery(delivery(event), CHANNEL).kind).toBe("ignored");
  });

  it("ignores an event type it does not handle", () => {
    const payload = { type: "event_callback", event_id: "Ev1", event: { type: "reaction_added" } };
    expect(classifyDelivery(payload, CHANNEL)).toEqual({
      kind: "ignored",
      reason: "event type reaction_added",
    });
  });

  it.each([
    ["an empty object", {}],
    ["a string", "not a payload"],
    ["null", null],
    ["an unknown envelope type", { type: "something_else" }],
    ["an event callback with no event id", { type: "event_callback", event: { type: "message" } }],
  ])("marks %s unreadable", (_label, payload) => {
    expect(classifyDelivery(payload, CHANNEL).kind).toBe("unreadable");
  });

  it("does not react to its own reply in a thread", () => {
    const ownReply = delivery({
      text: "Almost there, I could not find roughly what it costs.",
      bot_id: "B_FRONTDOOR",
      thread_ts: "1699999999.000001",
    });
    expect(classifyDelivery(ownReply, CHANNEL).kind).toBe("ignored");
  });
});
