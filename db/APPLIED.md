# Applied migrations

There is no migration history table on this shared Supabase project, so record every apply here by hand.

| Environment | Applied through | Checked |
| --- | --- | --- |
| Production (Supabase, schema `frontdoor`) | 0004 + seed (0002 and 0003 recreated the same day, before any real data) | 30 Aug 2026, verified against the database |

| Migration | What it adds |
| --- | --- |
| 0001 | The `frontdoor` schema |
| 0002 | `requests`, `trail` (append-only audit) and `events` (the record created on approval), plus the `PI-####` reference sequence. The application role cannot update or delete trail rows |
| 0003 | `inbound_messages`, the raw Slack deliveries with their de-duplication key, claim lease, and the thread link back to a request |
| 0004 | `inbound_emails`, the procurement replies and their de-duplication key |

## How to apply

Migrations run through the Supabase Management API as `postgres`, which leaves the
project's own migration history untouched. Wrap multi-statement ranges in
`begin; ... commit;` so a range lands whole or not at all.

```bash
TOKEN=<your Supabase access token>
python3 -c "import json;json.dump({'query':open('db/migrations/0001_schema.sql').read()},open('/tmp/p.json','w'))"
curl -s -X POST "https://api.supabase.com/v1/projects/<project-ref>/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data @/tmp/p.json
```

## Roles

The application never connects as `postgres`. `db/bootstrap.example.sql` shows the
one-time creation of `frontdoor_app`, which has `usage` on the `frontdoor` schema only.
Verified 30 Aug 2026: it has no usage on any other application's schema and cannot create
objects in `public`.

## Seed

`db/seed/demo.sql` replaces every request with the demo set for the public page. Apply it
the same way as a migration, after 0004. It resets the reference sequence so the next live
request follows on from the seeded ones.
