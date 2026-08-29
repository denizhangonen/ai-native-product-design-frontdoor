-- Demo data for the public status page. Invented items and teams only.
-- Business hours over two weeks, 09:30-17:30 Istanbul time (UTC+3), stored in UTC.
begin;

delete from frontdoor.inbound_emails;
delete from frontdoor.inbound_messages;
delete from frontdoor.events;
delete from frontdoor.requests;

insert into frontdoor.requests
  (reference, slack_user_id, requester_name, item, quantity, unit,
   budget_amount_cents, budget_period, budget_currency, amount_in_message, team, urgency, reason,
   status, parse_confidence, parse_rationale, parse_model, cap_quantity, cap_annual_cents,
   created_at, updated_at)
values
  ('PI-1001','U_DEMO','Demo Requester','Grammarly subscription',1,'subscription',
   1200,'monthly','USD',true,'Marketing','flexible','for the newsletter drafts',
   'guided',0.93,'One subscription at a monthly dollar figure; the team is named.','openai:gpt-4.1-nano',null,null,
   '2026-08-17 06:42:00+00','2026-08-17 06:42:03+00'),
  ('PI-1002','U_DEMO','Demo Requester','Figma',5,'seats',
   300000,'annual','USD',true,'Design','this_month','the design team is growing',
   'event_created',0.95,'Item, seat count, a yearly dollar figure and the team are all stated plainly.','openai:gpt-4.1-nano',4,null,
   '2026-08-17 08:15:00+00','2026-08-17 10:02:00+00'),
  ('PI-1003','U_DEMO','Demo Requester','USB-C docking stations',6,'units',
   84000,'one_off','USD',true,'Engineering','this_week','new starters next week',
   'guided',0.91,'Six units at a one-off unit price; read 6 x $140 as the total.','openai:gpt-4.1-nano',null,null,
   '2026-08-18 07:05:00+00','2026-08-18 07:05:02+00'),
  ('PI-1004','U_DEMO','Demo Requester','Datadog log retention add-on',1,null,
   180000,'annual','USD',true,'Platform','this_quarter','we keep hitting the 15-day limit during incidents',
   'rejected',0.9,'A yearly add-on with the figure given per year; the quarter is the stated timing.','openai:gpt-4.1-nano',null,null,
   '2026-08-18 11:30:00+00','2026-08-18 14:20:00+00'),
  ('PI-1005','U_DEMO','Demo Requester','Notion seats',3,'seats',
   3000,'monthly','USD',true,'Ops','flexible',null,
   'guided',0.92,'Three seats at a monthly per-seat price; read $10 x 3 as $30 a month.','openai:gpt-4.1-nano',null,null,
   '2026-08-19 06:50:00+00','2026-08-19 06:50:02+00'),
  ('PI-1006','U_DEMO','Demo Requester','Gartner market report on procurement software',1,null,
   250000,null,'EUR',true,'Strategy',null,'to size the market before the board meeting',
   'event_created',0.85,'A one-off is likely but not stated, so the period is left null; the figure is in euros.','openai:gpt-4.1-nano',null,null,
   '2026-08-19 12:10:00+00','2026-08-20 07:45:00+00'),
  ('PI-1007','U_DEMO','Demo Requester','Loom licence',1,'licence',
   1500,'monthly','USD',true,'Sales','this_month','async demos for prospects in other time zones',
   'guided',0.9,'One licence at a monthly dollar figure; the team is named.','openai:gpt-4.1-nano',null,null,
   '2026-08-20 09:20:00+00','2026-08-20 09:20:02+00'),
  ('PI-1008','U_DEMO','Demo Requester','Contractor for the security review',1,null,
   1200000,'one_off','USD',true,'Platform','this_quarter','the SOC 2 renewal needs an external review',
   'event_created',0.88,'A one-off engagement with a dollar figure; the quarter is the stated timing.','openai:gpt-4.1-nano',null,1000000,
   '2026-08-21 07:30:00+00','2026-08-21 13:05:00+00'),
  ('PI-1009','U_DEMO','Demo Requester','Standing desk',1,'unit',
   60000,'one_off','USD',true,'People',null,null,
   'guided',0.94,'One unit at a one-off price for the People team; no timing given.','openai:gpt-4.1-nano',null,null,
   '2026-08-24 06:35:00+00','2026-08-24 06:35:03+00'),
  ('PI-1010','U_DEMO','Demo Requester','Zoom webinar add-on',1,null,
   9000,'monthly','USD',true,'Marketing','this_month','the monthly customer webinar outgrew the free tier',
   'rejected',0.91,'One add-on at a monthly dollar figure; the team and the reason are stated.','openai:gpt-4.1-nano',null,null,
   '2026-08-25 08:00:00+00','2026-08-25 10:40:00+00'),
  ('PI-1011','U_DEMO','Demo Requester','1Password Business seats',12,'seats',
   115200,'annual','USD',true,'IT','this_week','onboarding the new office',
   'with_procurement',0.96,'Twelve seats at a yearly per-seat price; read 12 x $96 as the total.','openai:gpt-4.1-nano',null,null,
   '2026-08-27 07:10:00+00','2026-08-27 07:10:03+00'),
  ('PI-1012','U_DEMO','Demo Requester','Conference sponsorship, ProcureCon',1,null,
   500000,'one_off','USD',true,'Marketing','this_quarter',null,
   'with_procurement',0.89,'A one-off sponsorship with a dollar figure; the reason is not given.','openai:gpt-4.1-nano',null,null,
   '2026-08-28 13:25:00+00','2026-08-28 13:25:02+00');

-- The trail, in the order the code writes it.
insert into frontdoor.trail (request_id, type, actor, payload, reading_confidence, reading_model, created_at)
select id, 'created', slack_user_id,
       jsonb_build_object('item', item, 'quantity', quantity, 'unit', unit,
                          'amountCents', budget_amount_cents, 'period', budget_period,
                          'currency', budget_currency, 'confidence', parse_confidence),
       parse_confidence, parse_model, created_at
  from frontdoor.requests;

-- The rule's own words, exactly as src/domain/policy.ts prints them for these budgets.
create temporary table seed_reasons (reference text, route text, reason text, flags jsonb, annual_cents bigint) on commit drop;
insert into seed_reasons values
  ('PI-1001','guided','$144/year ($12/month) is within the $1,000/year threshold','[]',14400),
  ('PI-1002','procurement','$3,000/year is above the $1,000/year threshold, so procurement must approve','[]',300000),
  ('PI-1003','guided','$840/year ($840 one-off) is within the $1,000/year threshold','[]',84000),
  ('PI-1004','procurement','$1,800/year is above the $1,000/year threshold, so procurement must approve','[]',180000),
  ('PI-1005','guided','$360/year ($30/month) is within the $1,000/year threshold','[]',36000),
  ('PI-1006','procurement','Fails closed: the budget is not in USD and no billing period was stated (so the annual figure is unknown), so procurement must look at it','["currency_not_usd","period_not_stated"]',null),
  ('PI-1007','guided','$180/year ($15/month) is within the $1,000/year threshold','[]',18000),
  ('PI-1008','procurement','$12,000/year ($12,000 one-off) is above the $1,000/year threshold, so procurement must approve','[]',1200000),
  ('PI-1009','guided','$600/year ($600 one-off) is within the $1,000/year threshold','[]',60000),
  ('PI-1010','procurement','$1,080/year ($90/month) is above the $1,000/year threshold, so procurement must approve','[]',108000),
  ('PI-1011','procurement','$1,152/year is above the $1,000/year threshold, so procurement must approve','[]',115200),
  ('PI-1012','procurement','$5,000/year ($5,000 one-off) is above the $1,000/year threshold, so procurement must approve','[]',500000);

insert into frontdoor.trail (request_id, type, actor, payload, created_at)
select r.id,
       case when s.route = 'guided' then 'guided' else 'routed' end,
       'system',
       jsonb_build_object('route', s.route, 'reason', s.reason, 'flags', s.flags, 'annualCents', s.annual_cents),
       r.created_at + interval '2 seconds'
  from frontdoor.requests r join seed_reasons s on s.reference = r.reference;

insert into frontdoor.events (request_id, title, quantity, unit, budget_amount_cents, budget_period, budget_currency, created_at)
select id, item, coalesce(cap_quantity, quantity), unit,
       coalesce(cap_annual_cents, budget_amount_cents),
       case when cap_annual_cents is not null then 'annual' else budget_period end,
       case when cap_annual_cents is not null then 'USD' else budget_currency end,
       updated_at
  from frontdoor.requests where status = 'event_created';

insert into frontdoor.trail (request_id, type, actor, payload, reading_confidence, reading_model, created_at)
select r.id, 'procurement_approved', 'procurement',
       jsonb_strip_nulls(jsonb_build_object('eventId', e.id,
         'cap', case when r.cap_quantity is not null or r.cap_annual_cents is not null
                     then jsonb_build_object('quantity', r.cap_quantity, 'annualCents', r.cap_annual_cents) end,
         'note', case r.reference when 'PI-1002' then 'the fifth person can share for now'
                                  when 'PI-1008' then 'ten is the most we have left in the security line' end)),
       0.95, 'openai:gpt-4.1-nano', r.updated_at
  from frontdoor.requests r join frontdoor.events e on e.request_id = r.id
 where r.status = 'event_created';

insert into frontdoor.trail (request_id, type, actor, payload, reading_confidence, reading_model, created_at)
select id, 'procurement_rejected', 'procurement',
       jsonb_build_object('note', case reference when 'PI-1004' then 'we already have this in the platform contract renewal'
                                                 when 'PI-1010' then 'use the company webinar account instead' end),
       0.96, 'openai:gpt-4.1-nano', updated_at
  from frontdoor.requests where status = 'rejected';

-- The next live request follows on from the seeded ones.
select setval('frontdoor.request_reference_seq', 1012);

commit;
