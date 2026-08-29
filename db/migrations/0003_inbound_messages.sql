-- Raw Slack deliveries. The unique event_id is what makes a retried delivery harmless.
create table if not exists frontdoor.inbound_messages (
  id bigint generated always as identity primary key,
  event_id text not null unique,
  channel_id text not null,
  slack_user_id text not null,
  message_ts text not null,
  -- The opening message of the thread when this delivery is a reply inside one.
  thread_ts text,
  -- Kept for an opening message, so a follow-up can be read with it. A reply is read once
  -- and never stored: conversation the bot ignores is not conversation it keeps.
  text text,
  -- The request this message became. Only an opening message ever gets one.
  request_id uuid references frontdoor.requests (id) on delete set null,
  received_at timestamptz not null default now(),
  -- A delivery is only a duplicate once handled to completion; claimed_at lets a
  -- retry tell a dead attempt from one that is still running.
  claimed_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists inbound_messages_received_at_idx
  on frontdoor.inbound_messages (received_at desc);

create unique index if not exists inbound_messages_request_id_idx
  on frontdoor.inbound_messages (request_id)
  where request_id is not null;

-- A thread reply finds its request through the opening message's ts.
create index if not exists inbound_messages_thread_lookup_idx
  on frontdoor.inbound_messages (channel_id, message_ts)
  where thread_ts is null;
