# Tasks

## 1. Routing

- [ ] 1.1 Routing policy (order, first-token timeout, three-strike cool-down) as a pure module with unit tests using fake clocks (`pnpm test`)
- [ ] 1.2 Baseten target in `src/providers.ts` defaults to `meta-models/muse-spark-open-1026` (the hackathon key's model; default and key set 2026-10-28, a direct call answered 200); on 403/404 log the model and point at `BASETEN_MODEL`; read the answer from `reasoning_content` when `content` is null (raise `max_tokens`); verify `pnpm bench:llm` lists it when its key is set and skips it otherwise. Fireworks target only if its credits are granted
- [ ] 1.3 Cues route through the policy and report model and provider; verify on the phone with only the Meta key, then with Baseten

## 2. Measure

- [ ] 2.1 `pnpm bench:llm 20` with Spark Open on Baseten vs Spark 1.3 minimal; record time to first token p50/p95 in docs/benchmarks.md
- [ ] 2.2 Pick the default cue timeout from the measured p95 and note the decision in docs/kb/decisions.md

## 3. Key hygiene

- [ ] 3.1 Rotate the Baseten hackathon key (it was pasted into a chat on 2026-10-28): ask in the Baseten channel on the hackathon Discord, put the new key in `.env`, verify one call to `-1026` answers 200 without printing the key [human]
