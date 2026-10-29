# Tasks

## 1. Routing

- [x] 1.1 Routing policy (order, first-token timeout, three-strike cool-down) as a pure module with unit tests using fake clocks (`pnpm test`)
- [x] 1.2 Baseten target in `src/providers.ts` defaults to `meta-models/muse-spark-open-1026` (the hackathon key's model; default and key set 2026-10-28, a direct call answered 200); on 403/404 log the model and point at `BASETEN_MODEL`; read the answer from `reasoning_content` when `content` is null (raise `max_tokens`); unit tests with a fake fetch for both; `pnpm bench:llm` skips it when its key is not set. Fireworks target only if its credits are granted
- [x] 1.3 Cues route through the policy and report model and provider; unit tests; verify on the phone against the stubbed Meta API (`pnpm stub`) [phone]
- [x] 1.6 The last-resort route never enters a cool-down: when every route has failed, the cue still tries Spark 1.3 instead of throwing for two minutes; unit test with a fake clock where both routes fail three times (`pnpm test`)
- [ ] 1.4 `pnpm bench:llm` lists the Baseten target with its key set and one call to `-1026` answers [key:BASETEN_API_KEY]
- [ ] 1.5 Verify cues on the phone with the real Meta key, then with Baseten, each showing its model and provider [phone] [key:MODEL_API_KEY] [key:BASETEN_API_KEY]

## 2. Measure

- [ ] 2.1 `pnpm bench:llm 20` with Spark Open on Baseten vs Spark 1.3 minimal; record time to first token p50/p95 in docs/benchmarks.md [key:BASETEN_API_KEY]
- [ ] 2.2 Pick the default cue timeout from the measured p95 and note the decision in docs/kb/decisions.md

## 3. Key hygiene

- [ ] 3.1 Rotate the Baseten hackathon key (it was pasted into a chat on 2026-10-28): ask in the Baseten channel on the hackathon Discord, put the new key in `.env`, verify one call to `-1026` answers 200 without printing the key [human]
