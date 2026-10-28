# Tasks

## 1. Meetings as episodes

- [x] 1.1 Start/End meeting endpoints and phone buttons, auto-end after ten minutes of silence; verify with the simulated clip and a shortened timeout
- [x] 1.2 Meeting store in `data/meetings/` (git-ignored) with delete one / delete all; unit tests with a temp directory (`pnpm test`)
- [x] 1.3 End-of-meeting extraction with Muse Spark 1.3 structured output; evidence-id validation as a pure function with tests for dropped items

## 2. Language profile

- [x] 2.1 Glossary merge (new term, repeated term, example update) as a pure function with tests
- [x] 2.2 Asked/answered counter fed by addressing decisions and wearer turns within 20 s; unit tests
- [x] 2.3 Glossary and stats view on the phone; verify at 390 px

## 3. Briefing and replies

- [ ] 3.1 Briefing endpoint and card with sources; verify with two simulated meetings where the second briefing cites the first
- [ ] 3.2 Grounding check drops items without valid sources; unit test
- [ ] 3.3 Reply prompt includes the profile prefix; verify cached tokens appear in `usage` on the second call and record the hit rate in docs/benchmarks.md
