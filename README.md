# Frontdoor

A front door for spending that lives where people already work.

An employee asks for a purchase in Slack, in plain words. The request is understood, the
spending policy is applied in code, and either the answer comes back on the spot or a
structured brief goes to procurement by email. Procurement replies in plain words, with a
limit if they like. The requester hears back in the same Slack thread, and a record now
exists that procurement owns. Nobody opens a new portal.

This is a **working slice, not a product**. Episode 2 of a series on AI-native product
design. Episode 1 was [Dealdesk](https://github.com/denizhangonen/ai-native-product-design-dealdesk).

Live at **https://ai-native-frontdoor.vercel.app**

## The thesis

**The model extracts; code decides.** A language model turns a message into fields and an
email reply into a decision it reports. It never routes, never changes a status, never
applies a policy. Every threshold and every state transition is a pure function with a
test. Where the rule cannot compare, it fails closed: a human looks.

## The problem

Employees buy things without procurement knowing: tools, subscriptions, services.
Procurement is pulled in late or never. The fix is not another portal nobody visits; it is
a front door in the channel people already use, one that answers the small requests itself
so that only the ones that need a human reach one.

## The flow

1. Someone writes in `#purchasing`: "Need Figma for the design team, 5 seats, about
   $3k/year, sometime this month."
2. The model extracts item, quantity, cost, period, currency, team, urgency, reason. Code
   decides what is missing. If the item or the cost is missing, one question is asked in
   the thread, and the requester's reply is read together with the first message.
3. The policy runs in code. At or under the threshold, in USD, with a stated period and a
   figure that is actually written in the message: guided on the spot, no human. Anything
   else: a brief goes to procurement by email, with the gaps named.
4. Procurement replies "approve", "reject", "approve but cap at 4 seats", "up to $200 a
   month", or a question. The model reads the reply; code checks the limit fits and moves
   the state. On approval an event record is created in the same transaction.
5. The requester hears back in their thread. The status page shows the pipeline and, per
   request, what the model read and which rule decided.

## Status

The full loop works end to end with the stand-in model and mail provider, exercised with
signed Slack and email payloads against the real database, and the read-only pages are
live on the seeded demo set. Wiring to a Slack workspace and to Resend is a configuration
step; the connector code is Episode 1's, which ran against both in production, with the
changes listed in the ledger below.

`/` lists recent requests, `/r/PI-1002` shows one. Each request records two things side by
side: the model's own note on how it read the message, with the confidence and the model
name, and the rule's reason as written at the time. Telling those apart is the point.

Both pages are public and read-only, so they show no names, no addresses, no reasons and
no notes.

## Stack

Next.js (App Router, TypeScript), Postgres on Supabase, deployed on Vercel. Slack and
email need a public HTTPS URL to deliver events to, which is the whole reason this is
deployed rather than run locally.

## Layout

Each layer is a folder under `src/`. A layer may only import from the layers listed as allowed.

| Layer | Folder | Holds | May import |
| --- | --- | --- | --- |
| Domain | `src/domain/` | Types, state machine, policy, caps, grounding. Pure functions, no I/O. | nothing |
| Data | `src/data/` | SQL queries, one file per concept. | domain |
| AI | `src/ai/` | Prompts, model calls, output schemas and validation. | domain |
| Integrations | `src/integrations/` | One folder per external system (Slack, email). | domain |
| Guards | `src/guards/` | Signature checks, allow-lists, sender authentication, rate limits. | domain |
| Services | `src/services/` | Use cases that orchestrate all of the above. | all of the above |
| API | `src/app/api/` | Thin route handlers. | guards, services |
| UI | `src/app/`, `src/components/` | Pages and presentational components. | data, services, components |

One deliberate exception: the Slack route parses the event envelope and posts the apology
itself, because it must answer Slack's challenge and its three-second deadline before any
service runs.

The model extracts; code decides. The policy lives in `src/domain/policy.ts`, never in a prompt.

What happens when things go wrong, and how each case is proven: [docs/confidence.md](docs/confidence.md).

## Running it

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL
npm run dev
npm run check                # typecheck, lint, tests
LIVE_DB=1 npm test           # also runs the flow against the database in DATABASE_URL
```

With your own Postgres: apply `db/migrations/0001` to `0004` in order with `psql`, then
`db/bootstrap.example.sql` with a real password, then `db/seed/demo.sql` if you want the
demo set.

`GET /api/health` reports whether the app can reach its database. With `LLM_PROVIDER=fake`
and `EMAIL_PROVIDER=fake` the whole flow runs with no account and no network: a crude
pattern matcher stands in for the model, and sent mail lands in an in-memory outbox.

## Database

Tables live in a dedicated `frontdoor` schema. The application connects as `frontdoor_app`,
a role with access to that schema and nothing else, and it cannot update or delete the
audit trail. See `db/APPLIED.md`.

## Built on Episode 1

The honest ledger. Episode 1's connector layer carried over almost whole; the new problem
needed a new domain and one thing Episode 1 deliberately ignored: thread replies.

**Copied as is.** The HMAC, Slack and Resend signature guards, the rate limit, the email
provider interface and its fake implementation, the HTML-to-text and quoted-text
stripping, the address masking, the note grounding (a model may quote procurement, never
speak for it), the auto-refresh and time formatting.

**Copied and adapted.** The config, the request and status types, the transaction shapes
of the submit and decide services, the Slack client (it now escapes what a person typed),
the Slack event parser (it now lets thread replies through), the claim lease (longer, and
released on failure), the Resend implementation (custom headers, list-form headers), the
inbound-email reader (auto-submitted guard, stricter verdict), the reply and email copy,
the prompts, the parsers (with one shared bounded call), the allow-list (renamed), the
sender authentication (it now requires the verdict to align with the From domain), the
migrations, the seed, the status page components and the two-card page.

**New.** The policy with its fails-closed flags, the grounding check that the extracted
figure is written in the message, caps and their plausibility, the `needs_detail` lifecycle
and the clarify-in-thread flow (origin lookup, merge with the opening message, one more
ask, then start fresh), the brief, the event record, the public view type, the note
scrubber, the loop guard for mailboxes that answer back, the claim release on failure, the
retention cron.

## Not built on purpose

No sourcing: no supplier lists, no bidding, no documents, no supplier contact. The event is
a record card, nothing more. No multi-line requests: one item, one quantity, one budget.
No multi-stakeholder requirements gathering. No admin UI, no user accounts, no CRM. Policy
is a threshold in configuration, not a rules engine. Those are product surface, and the
point here is the workflow.

## What a full version would need

- **A permissions model.** One allow-list decides who may approve, and the status page is
  public. A real version needs roles, per-category approvers, and a page that knows who is
  looking at it.
- **A real policy.** One threshold in USD per year. A real version needs categories,
  currencies with rates, per-team budgets, and a way to change them with an audit trail.
- **Richer audit exports.** Every request keeps an append-only trail of who read what,
  which rule fired, who decided and when. It is queryable, not yet exportable.
- **An owned inbound domain per tenant.** Replies arrive on one subdomain. Several
  companies would each need their own, with the sender checks scoped to it.
- **Somewhere for the event to go.** The record card is where a purchasing or contract
  system would pick up. That handoff is the next episode's problem, not this one's.
