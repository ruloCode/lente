# Tasks

Depends on: `add-meeting-library`

## 1. Hub

- [ ] 1.1 `src/ask.ts`: prompt with the memory prefix, structured output (answer, citations or not-in-memory), citation validation against stored meetings, the decline for questions outside the memory; unit tests with a fake model (`pnpm test`)
- [ ] 1.2 POST route for a typed question; voice trigger for wearer turns starting with "Lente" (no DILO for that turn, off in Solo grabar); unit tests for the trigger (`pnpm test`)
- [ ] 1.3 Grounding eval over the synthetic eval meetings (answerable and not-in-memory questions); record accuracy, refusals and latency p50/p90 in `docs/benchmarks.md` [key:MODEL_API_KEY]

## 2. Phone

- [ ] 2.1 Preguntar screen in the menu with question box, answers and meeting chips that open the detail at the turn; verify on the phone against meetings recorded from test speech [hw] [phone]
- [ ] 2.2 Lente cards in the reply slot, spoken in Spanish; verify by asking by voice through the clip with test speech [hw] [phone]
- [ ] 2.3 README "What was built during the hackathon" row for the day the change lands
