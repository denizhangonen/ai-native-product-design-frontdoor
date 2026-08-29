# Frontdoor

Read `README.md` first: the thesis, the layers, and what is deliberately not built.

- The model extracts; code decides. Routing, thresholds and state transitions live in `src/domain/`, never in a prompt.
- Each layer under `src/` imports only from the layers below it (table in the README).
- Files stay small, comments only where the code cannot say it, named exports, `async/await`.
- Every domain rule and every parser has a Vitest test. `npm run check` must be green.
- Secrets live only in `.env.local` and the deployment's environment. Never in code, fixtures, docs or logs.
