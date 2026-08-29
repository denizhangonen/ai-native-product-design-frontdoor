# Confidence

Building the happy path took a fraction of the time. Most of the work, and most of the
code, is about what happens when something is wrong. This is the list, with what the
system does in each case and how that is proven.

## The rule that makes everything else safe

**The model extracts; code decides.** A language model turns a Slack message into fields
and an email reply into approve/reject/unclear with any limit it names. It never chooses
the route, never changes a status, and its output is validated against a strict schema
before anything downstream sees it. The policy (annual spend above the threshold needs
procurement; anything the rule cannot compare goes to procurement too) lives in
`src/domain/policy.ts`, a pure function with a test on every edge. A test asserts the
model's output can never carry a route or a status.

## Fails closed

The guided path, the one where nobody is involved, is only taken when every fact the rule
needs is present and checked: a figure that code found written in the message, a currency
that is USD, a billing period that was stated. Anything less goes to procurement with the
gap named in the brief. The rule can be wrong in only one direction: too careful.

## Telling the two apart

Every request records how it was read and, separately, why it was routed. The status page
shows both side by side: the model's own one-line note with the confidence and the model
name, and the rule's reason as it was written on the trail at the time. The same rule is
run again on the page, and if a changed threshold would decide differently today, the page
says so rather than rewriting history.

## Failure modes

| What goes wrong | What the system does | Proven by |
| --- | --- | --- |
| Message is not a purchase request | Replies "could not read that" with an example, stores nothing | Unit test, local run |
| Message names the item but not the cost, or the cost but not the item | Stores the request as waiting, asks for the missing piece by name in the thread | Unit test, local run |
| Requester answers in the thread | The answer is read together with the opening message; what the first message said is kept | Unit test, local run |
| Someone else answers in the thread | Ignored, logged, no reply | Unit test, local run |
| The requester answers a request that has already moved on | Ignored as conversation | Unit test |
| The answer still lacks the piece | Asked once more; after that, told to start fresh | Unit test |
| Two quick answers in the thread | The first completes the request; the second is conversation | Unit test |
| Answer arrives before the opening message has been read | Told to say it again in a moment, nothing dropped | Unit test |
| The model reads a figure that is not written in the message | The policy fails closed to procurement, flagged in the brief | Unit test |
| Budget in a currency other than USD, or with no currency, or with no period | Never guided; procurement, with the gap named | Unit test, live seed |
| Monthly figure that crosses the threshold by the year | Procurement | Unit test |
| Model returns prose, a code fence, or truncated JSON | One retry, then treated as a model failure, not the person's fault | Unit test |
| Model returns a route, a status, or a verdict | Ignored by the schema; a shape it cannot read is a model failure | Unit test |
| Model is unsure (low confidence) | Treated as not understood rather than guessed | Unit test |
| Model times out or the provider is down | The delivery stays unhandled and its claim is released; the person is asked to say it again | Unit test |
| Slack delivers the same event twice | Second delivery is a no-op (unique `event_id`) | Unit test, local run |
| Slack redelivers while the first attempt is still running | The redelivery does nothing; one message stays one request | Unit test, local run |
| An attempt dies partway through | Its claim is released at once; a later delivery takes over | Unit test |
| An attempt dies after creating the request but before saying so | The retry finds the request and does not create a second | Unit test |
| Request with a forged Slack signature | 401, nothing read | Unit test, local run |
| Captured Slack request replayed later | Rejected after five minutes | Unit test |
| A request carrying `<!channel>` or a disguised link | Escaped before the bot repeats it; nothing a person typed can address the channel | Unit test, local run |
| Slack name lookup fails | Request is still created, Slack id used as the name | Unit test |
| The reply to Slack fails after the request is saved | Logged; never reported as a lost request | Unit test, local run |
| The brief cannot be sent | Written on the trail, and the requester is told procurement has not been told | Unit test |
| The model's note names the requester | Dropped before it is stored, so the public page never shows it | Unit test |
| Reply from someone who is not procurement | Ignored and logged, before a row is written or the model reads it | Unit test, local run |
| Reply whose display name impersonates procurement | Refused: only the real address counts | Unit test |
| Reply with a valid signature for a different domain | Refused: the verdict must vouch for the From domain itself | Unit test |
| Reply with no authentication verdict at all | Refused: identity is the only gate on state | Unit test |
| Reply sent by a machine (out-of-office, ticketing acknowledgement) | Ignored; every mail this app sends is marked so machines do not answer it | Unit test |
| Mail for another app on the same domain (the provider fans every received mail out to every webhook) | Ignored unless our own address is a recipient | Unit test |
| A mailbox that keeps answering back | After a handful of answers per sender and request, the system goes quiet | Unit test |
| No procurement address configured | Nobody can decide (fails closed) | Unit test |
| Reply is a question, not a decision | Clarification email, state unchanged | Unit test, local run |
| Reply names a limit above what was asked, below one, or on a quantity the request never had | Clarification email, state unchanged | Unit test, local run |
| Reply names a monthly limit | Multiplied by twelve in code before it is compared | Unit test, local run |
| Reply names a limit equal to what was asked | A plain approval; no cap is recorded | Unit test |
| Reply about a request that is guided, waiting, or already decided | The model is not asked; the sender is told nothing has changed | Unit test, local run |
| Reply about a request that does not exist | The sender is told the reply could not be matched | Unit test, local run |
| Model writes a condition procurement never wrote | The note is dropped rather than passed on as theirs | Unit test |
| Same reply email redelivered | No-op (unique `message_id`) | Unit test, local run |
| Redelivery while the first attempt is still running | Answered with 503, so the provider tries again later | Unit test |
| Two replies at the same moment | Row lock (`select ... for update` in `src/data/requests.ts`): one wins, the other is refused | Code path; not exercised concurrently |
| Second reply contradicts the first | The first decision stands; the sender is told | Unit test, local run |
| Approval applied twice | One event, ever (unique `request_id`) | Live database test |
| A 50,000 character message or reply | Truncated before the model; a long opening message cannot hide the follow-up | Unit test |
| Reply with a forged webhook signature | 401, the body is never fetched | Unit test, local run |
| Delivery signed for a different body | 401 | Unit test |
| Captured delivery replayed later | Rejected after five minutes | Unit test |
| Reply that arrives as HTML with no plain text | Converted to text before it is read | Unit test |
| Mail provider rotates its signing key | Both keys are accepted while the old one lives | Unit test |
| Brief sent twice by a retry | Idempotency key makes it one email | Unit test |
| Requester cannot be notified in Slack | Decision is already recorded; failure logged | Unit test |
| One caller floods an inbound route | 429 after 120 requests a minute, per caller | Unit test |
| Status page asked for a malformed or unknown reference | 404 | Live |
| An empty environment variable | Treated as not set, never as zero | Unit test |
| A cron call without the secret | 401 | Unit test |

"Local run" means exercised end to end against a local server with signed requests and
the real database. "Live" means exercised on the deployed application.

## What a reader of the public page cannot see

The status page has no login, so it shows no requester names, no Slack ids, no email
addresses, no justifications given by the requester, and no notes from procurement. The
data the page receives has those fields removed before it reaches any component. It
shows references, items, teams, quantities, budgets, statuses, times, the model's one-line
note on how it read the message, and the rule's reason.

That note is written by a model about a message this project does not control, which is
why every message here is synthetic, why the prompt forbids naming a person, and why a
note that names one anyway is dropped by code. A real deployment would put this page
behind a login before showing it.

## What is logged

One structured line per inbound delivery and per state change, carrying the request
reference and an outcome, plus the masked recipient domain and provider message id of
each mail sent, Slack event ids, and the model's token counts. Never a message body, an
email body, a subject line, an address, a token, or a connection string. An error is
logged by name and driver code; its message only when the message was built by this
codebase from a code.

## Known limits

- The rate limit is per serverless instance, so it bounds abuse of one instance rather
  than the whole deployment. It stops a runaway client, not a determined one.
- Both pages are rebuilt at most every five seconds and shared by every viewer, so a
  decision can take that long to appear. A tab polls only while visible and stops after
  ten minutes.
- Slack expects an answer within three seconds. The route answers at once and does the
  work afterwards; a failure after that answer is apologised for in the thread, and the
  person is asked to say it again.
- The figure check is on digits: "$3k" and "3,000" both count, "three thousand" does not,
  and a request written in words goes to procurement rather than being guided.
- A money cap is read in dollars. On a request made in another currency it is refused and
  the sender asked again; a seat cap still works.
- Deliveries that never became a request are kept for thirty days for de-duplication,
  then pruned by a daily cron. A thread reply's text is never stored at all.
- Mail is sent and received through Resend on a subdomain of its own. The signature check
  is Resend's; the application's own scheme is still there for local runs with no mail account.
