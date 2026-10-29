# Tasks

## 1. Hub

- [x] 1.1 Spanish-first transcription bias: `["Spanish", "English"]` as the default in `src/asr-session.ts`; unit test that the session request lists Spanish first (`pnpm test`)
- [x] 1.2 Reply with meaning: the reply call returns the sentence and, for a question not in Spanish, its Spanish meaning in one Muse Spark 1.3 call; a pure parser in `src/briefing.ts` caps both at 90 characters and drops a missing or Spanish-question meaning; the cue event gains the meaning as its own field; unit tests for English, Spanish and missing-meaning answers (`pnpm test`)
- [x] 1.3 Measure the reply before and after 1.2 on the eval set (`pnpm eval`); record cue latency (p50, p90) and how many English replies carried a meaning in `docs/benchmarks.md`, and the decision in `docs/kb/decisions.md` [key:MODEL_API_KEY]
- [x] 1.4 Spanish notes: the notes prompt in `src/meetings.ts` writes summary, decisions, commitments and open questions in Spanish, names and terms as said; verify one real extraction of an English test meeting (synthetic speech, not a real meeting) comes back in Spanish [key:MODEL_API_KEY]

## 2. Phone

- [ ] 2.1 Dilo card shows the Spanish meaning under the sentence, smaller and muted, only when present; narration speaks only the sentence; verify with the clip and the phone: an English question played as test speech shows the English line with its meaning, a Spanish question shows the line alone [hw] [phone]
- [ ] 2.2 README "What was built during the hackathon" row for the day the change lands
