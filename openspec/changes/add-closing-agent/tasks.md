# Tasks

## 1. Agent loop

- [ ] 1.1 Verify Muse Spark 1.3 function calling with one real call and record the request/response shape in docs/kb/meta-api.md [key:MODEL_API_KEY]
- [x] 1.2 Tool registry and two-phase loop with an eight-step limit; unit tests with a fake model covering plan, early stop and the external-effect guard (`pnpm test`)
- [x] 1.3 Evidence resolution drops ungrounded proposals; unit test

- [ ] 1.4 Function-calling adapter for Muse Spark 1.3 from the request/response shape recorded in 1.1, and the hub calling `planActions` when a meeting's notes are extracted, with `resolveEvidence` applied before proposals are stored; one real run on a synthetic meeting shows proposals in Acciones [key:MODEL_API_KEY]

## 2. Tools

- [x] 2.1 Read-only tools (meeting record, glossary, task list) and `propose_actions`; unit tests
- [x] 2.2 Local task list and reminder tools (reminders exported as an `.ics` file); verify a created task links to its meeting
- [x] 2.3 Email draft tool (draft only, never sends); verify the draft is editable and copied, not sent

- [x] 2.4 Reminders use the wearer's local time (09:00 where the wearer is, a floating `.ics` time without `Z`), not 09:00 UTC, which is 4 a.m. in Bogotá; fix the comment in `src/agent-tools.ts` to match; test that the `.ics` carries no `Z` and the hour is local (`pnpm test`)

## 3. Approval and traces

- [x] 3.1 Action cards on the phone with Approve / Edit / Reject; verify pending actions survive a hub restart and none runs on its own [phone]
- [x] 3.5 Approving a proposal that has no `due` or `note` doesn't send those fields as empty strings; test (`pnpm test`)
- [ ] 3.2 Trace writer (`data/traces/`, git-ignored) and trace viewer; verify every step of one real run is visible in order
- [ ] 3.3 End-to-end run on a simulated meeting: two commitments become two approved tasks and one edited email; record steps, tokens and latency in docs/benchmarks.md [key:MODEL_API_KEY]
- [x] 3.4 Acciones lists tasks as Pendientes and Hechas with counts, due hints and meeting chips; the checkbox moves a task and survives a hub restart; replaces the "Pronto" entry; verify on the phone [phone]
