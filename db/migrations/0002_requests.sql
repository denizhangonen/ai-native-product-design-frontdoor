create sequence if not exists frontdoor.request_reference_seq start 1001;

create table if not exists frontdoor.requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('PI-' || nextval('frontdoor.request_reference_seq')),
  slack_user_id text not null,
  requester_name text not null,
  item text,
  quantity integer check (quantity is null or quantity >= 1),
  unit text,
  budget_amount_cents bigint check (budget_amount_cents is null or budget_amount_cents >= 0),
  budget_period text check (budget_period is null or budget_period in ('one_off', 'monthly', 'annual')),
  budget_currency char(3),
  -- Checked by code: the figure the model read is written in the message. False fails closed.
  amount_in_message boolean not null default true,
  team text,
  urgency text check (urgency is null or urgency in ('this_week', 'this_month', 'this_quarter', 'flexible')),
  reason text,
  status text not null check (status in ('received', 'needs_detail', 'guided', 'with_procurement', 'rejected', 'event_created')),
  -- How the model read the message. The decision itself stays a rule in code.
  parse_confidence numeric(4, 3) check (parse_confidence is null or (parse_confidence >= 0 and parse_confidence <= 1)),
  parse_rationale text,
  parse_model text,
  -- What procurement allowed, when less than what was asked.
  cap_quantity integer check (cap_quantity is null or cap_quantity >= 1),
  cap_annual_cents bigint check (cap_annual_cents is null or cap_annual_cents >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Only a request still waiting for detail may lack the fields the policy needs.
  constraint requests_complete_once_routed check (
    status in ('received', 'needs_detail')
    or (item is not null and budget_amount_cents is not null)
  )
);

create index if not exists requests_created_at_idx on frontdoor.requests (created_at desc);

-- Append-only audit trail: the application role can only insert and read it.
-- It goes with its request if an operator ever deletes one; the application never does.
create table if not exists frontdoor.trail (
  id bigint generated always as identity primary key,
  request_id uuid not null references frontdoor.requests (id) on delete cascade,
  type text not null,
  actor text not null,
  payload jsonb not null default '{}'::jsonb,
  -- When a model read something to produce this entry, how sure it was and which model.
  reading_confidence numeric(4, 3) check (reading_confidence is null or (reading_confidence >= 0 and reading_confidence <= 1)),
  reading_model text,
  created_at timestamptz not null default now()
);

create index if not exists trail_request_id_idx on frontdoor.trail (request_id, created_at);

-- The record created on approval. One per request, ever.
create table if not exists frontdoor.events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references frontdoor.requests (id) on delete cascade,
  title text not null,
  quantity integer check (quantity is null or quantity >= 1),
  unit text,
  budget_amount_cents bigint not null check (budget_amount_cents >= 0),
  budget_period text check (budget_period is null or budget_period in ('one_off', 'monthly', 'annual')),
  budget_currency char(3),
  owner text not null default 'procurement',
  status text not null default 'created' check (status in ('created')),
  created_at timestamptz not null default now()
);

revoke update, delete on frontdoor.trail from frontdoor_app;
