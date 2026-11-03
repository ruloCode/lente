# Tasks

Status: Phase 3 (product), after the hackathon submission. Group 1 changes no stored data and may land earlier if the owner asks.

Depends on: `add-accounts`

Fast path ships behind `LENTE_RECALL=fast` until group 9's eval shows it is at least as accurate as the tiers; then the default flips.

## 1. Measure and fix what is wrong today

- [x] 1.1 `scripts/bench-ask.ts` (`pnpm bench:ask [runs] [days]`): synthetic bilingual memory generator (two projects, invented people, PROBE- names) at 1, 30 and 365 days of all-day recording; times the production path, the laptop path and, later, the fast path; reports p50/p90 per path, per call, prompt and cached tokens, found rate; scoped questions include an out-of-project probe; prints JSON lines for `docs/benchmarks.md`. Verify: one run on the current code reproduces the baseline table in `design.md` within noise [key:MODEL_API_KEY]
- [x] 1.2 Truncation: `completeChat` returns `finishReason`; `ask` and `askTiers` use a 1,500-token cap; a `length` finish is retried once at double the cap or reported as failed, never as not found. Tests with a fake model that truncates (`pnpm test`)
- [x] 1.3 Scope: `askWhole` in a project passes only in-scope meeting notes and kept facts, no profile or global digests, and its day loader keeps only entries inside the project's meetings' spans. Hub test with a fake model that captures messages: a scoped question's prompt holds no text from another project (`pnpm test`). Done as a laptop-mode hub test (`test/ask-scope-hub.test.ts`) plus the accounts path through `scopeTierInput` and `entriesInSpans` at the `askTiers` boundary (`test/ask-tiers.test.ts`): an accounts hub's meetings are sealed and can only be seeded by recording
- [x] 1.4 Cache order in `askTiers`: the memory prefix becomes the first developer message shared by plan and answer. Verify with `pnpm bench:ask 2`: the answer call reports cached tokens on the second run; record the before/after table in `docs/benchmarks.md` [key:MODEL_API_KEY]

## 2. The index core (pure)

- [x] 2.1 `src/memory-index.ts`: units, accent folding and ES/EN stopwords (shared with the planned blind index), BM25 postings per shard, filters (project, time range, speaker or person, validity), incremental add and remove. Tests: add, search, remove, filter isolation between projects (`pnpm test`)
- [x] 2.2 Fusion: reciprocal rank fusion (k 60) across lists, people boost, recency prior off when a time is named, ±1 neighbour expansion, `RECALL_MIN_SCORE` confidence. Tests on hand-built lists with known expected order (`pnpm test`)
- [x] 2.3 Snapshot codec: shard ↔ compact binary (term dictionary, postings, unit table, optional int8 vectors and bit codes), versioned, round-trip and corruption tests (`pnpm test`)
- [x] 2.4 Microbench in `scripts/bench-ask.ts --index-only`: build time, query p50/p95 and RSS at 30, 90 and 365 synthetic days, lexical only and with random int8 vectors of 384 dims. Verify: numbers recorded in `docs/benchmarks.md`; if 90 days exceeds 30 ms p95, revise decision 3 before group 3

## 3. Fast recall for text

- [ ] 3.1 `src/time-phrases.ts` (shared with `add-memory-timeline` 3.1, whichever lands first): «hoy», «ayer», weekdays, «la semana pasada», «hace dos semanas», months, «esta mañana/tarde», English equivalents, in the wearer's time zone. Tests in Spanish and English (`pnpm test`)
- [ ] 3.2 `src/recall.ts` question parsing: terms, time range, people from speakers and cards (accent-folded, partial names), a named project, aggregate intent. Tests (`pnpm test`)
- [ ] 3.3 Prompt assembly (rules, memory prefix, «RECUPERADO», history, question) within the text and voice budgets, and the streaming parser for `@answer` / `@none` / `@command` and `[[id]]` markers split across deltas. Tests with chunked fake streams, including made-up ids, a marker split in two deltas and a command (`pnpm test`)
- [ ] 3.4 Hub wiring in `src/pilot.ts`: the runtime builds the index from its loaded records at open and adds turns, descriptions, notes and facts as they arrive; `POST /ask` with `Accept: text/event-stream` streams `delta`, `source`, `replace`, `job` and `done` events (JSON reply kept for old clients); deep path for aggregates and low confidence with a `searching` event. Hub tests with the stub Meta server (`pnpm test`, `pnpm smoke`)
- [ ] 3.5 Run `pnpm bench:ask 5 30` with `LENTE_RECALL=fast`: record first token and total p50/p90 next to the tiers in `docs/benchmarks.md` [key:MODEL_API_KEY]

## 4. Streamed answers on the phone and the web

- [ ] 4.1 Android chat: read the SSE answer, render text as it streams, chips as `source` events arrive, «Buscando más…» on `searching`, swap on `replace`; JVM tests for the event reducer (`pnpm android:test`)
- [ ] 4.2 Web desktop `/app`: the same events in the chat panel; unit test for the reducer (`pnpm test`)
- [ ] 4.3 On the phone against a hub with synthetic memory from test speech: a whole-memory question, a project question and an out-of-project probe; screenshots and the first-text time from the hub log [phone]

## 5. Voice in one step

- [ ] 5.1 Session preload: the voice session's first developer message holds the memory prefix (project prefix when opened inside a project). Test with the voice stub that the prefix is sent once and stays first (`pnpm test`)
- [ ] 5.2 Speculative recall: retrieval on ASR partials (debounced 150 ms) and on `speechComplete`; lines above `RECALL_MIN_SCORE` attached as one developer item before the turn; markers stripped from speech and shown as chips. Tests with scripted partials (`pnpm test`)
- [ ] 5.3 `ask_memory` returns lines (with optional time and person filters) instead of a nested answer. Tests with the stub that answers tool calls (`pnpm test`)
- [ ] 5.4 `pnpm bench:voice 2` on 30 synthetic days: end of speech → first answer sentence for memory questions, before and after; record in `docs/benchmarks.md` [key:MODEL_API_KEY]
- [ ] 5.5 By voice through the clip with test speech from the Mac's `say`: a memory question answered with chips on the phone [hw] [phone]

## 6. Consolidation while recording

- [ ] 6.1 `src/consolidate.ts` `segmentTurns` (8 s pause, speaker change after 20 s, 40 s cap, episode boundary) and live indexing of segments in the runtime. Tests on synthetic turn streams (`pnpm test`)
- [ ] 6.2 Card fields in the notes call (`people`, `facts` with `about`/`evidence`/`valid_from`/`supersedes`, `keys_es`, `keys_en`) with validation of evidence and of `supersedes` against the facts shown; the call is shown the 5 best-matching existing facts. Tests with a fake model that invents ids (`pnpm test`)
- [ ] 6.3 Window cards every 10 minutes of speech in long episodes, skipped under idle pause or the silence gate; card ids `c<episode>:<n>`. Tests with a fake clock (`pnpm test`)
- [ ] 6.4 Validity: supersession closes `validTo`; "now" questions filter to valid facts; kept facts never superseded. Tests for the launch-date scenario in the spec (`pnpm test`)
- [ ] 6.5 Briefs and people cards: new digest scopes `brief` and `person`, debounced brief rewrite (30 min) and nightly people cards; in the usage meter and under the spend cap. Tests with a fake model and fake clock (`pnpm test`)
- [ ] 6.6 One 2-hour synthetic Solo grabar run through `scripts/fake-clip.ts`: cards per window, cost per recorded hour and time from window close to card; record in `docs/benchmarks.md` [key:MODEL_API_KEY]

## 7. Persistence

- [ ] 7.1 Migration `memory_snapshots` (user_id, shard, format_version, encoder, built_through, blob sealed) and `memory_cards` with RLS and no policy for `anon`/`authenticated`; stores in `src/supabase-stores.ts` and file stores in `src/stores.ts` (`data/memory/`). Tests with the fake PostgREST that no plain column carries content (`pnpm test`)
- [ ] 7.2 Runtime open: load hot snapshots, replay records after `built_through`, write behind every 10 minutes when dirty and at eviction before the key is dropped; cold shards loaded lazily (LRU 3). Tests for open, replay, eviction order and a corrupt snapshot falling back to a rebuild (`pnpm test`)
- [ ] 7.3 Forget a day and delete a meeting remove units, cards and facts from the index and storage and queue brief and people rewrites. Tests (`pnpm test`)
- [ ] 7.4 Apply the migration on the project, run the security advisors, check with the publishable key that it returns no rows [key:SUPABASE_SECRET_KEY]
- [ ] 7.5 Measure runtime open with 30 and 365 synthetic days, with and without snapshots; record in `docs/benchmarks.md`

## 8. Vector recall

- [ ] 8.1 Candidates: confirm the Meta API still lists no embedding model; check one Meta open-weights encoder (e.g. SONAR) for licence, languages, dimension and Modal cost; pick one small multilingual CPU encoder for the hub. Write the findings under "Vectors in the memory index" in `docs/kb/decisions.md`
- [ ] 8.2 `scripts/eval/recall-set.ts`: ~120 labelled questions over synthetic bilingual meetings (paraphrase, cross-lingual, names and numbers, time, out of memory). Verify: the set loads and every label points to a real segment (`pnpm test`)
- [ ] 8.3 Encoder client behind one interface (`embed(texts): Int8 vectors`), with the hub encoder and the Modal encoder as two implementations; the Modal function in the hub's Modal app logs no text. Tests with a fake encoder (`pnpm test`)
- [ ] 8.4 Run the bake-off (A baseline, B hub encoder, C Modal encoder): recall@10, MRR, cross-lingual subset, query embedding p50/p95 from the hub, RSS per 100k units; record in `docs/benchmarks.md` and apply decision 7's selection rule in `docs/kb/decisions.md` [key:MODEL_API_KEY]
- [ ] 8.5 Vector lists in the index with the chosen encoder: batch embedding of segments every 5 s, query embedding in parallel with lexical search, bit-code prefilter and int8 rescoring, sealed vectors in snapshots, background rebuild on encoder change with lexical answers meanwhile. Tests: fusion order with fake vectors, snapshot round-trip with vectors, rebuild on encoder id change (`pnpm test`)
- [ ] 8.6 Re-run `pnpm bench:ask 5 90` and `--index-only` at 365 days with vectors on; record retrieval p95 and RSS in `docs/benchmarks.md` [key:MODEL_API_KEY]

## 9. Eval, default and docs

- [ ] 9.1 Grounding eval over the recall set for the fast and deep paths: accuracy, citation accuracy, refusals on out-of-memory and out-of-project questions, first token and total p50/p90; record in `docs/benchmarks.md` [key:MODEL_API_KEY]
- [ ] 9.2 Flip the default to `LENTE_RECALL=fast` when 9.1 shows accuracy ≥ the tiers'; update `add-ask-lente` and `add-voice-mode` tasks to note the plan step is replaced. Verify: `pnpm typecheck && pnpm test && pnpm smoke`
- [ ] 9.3 README "Related work": mem0, Letta, Zep/Graphiti, LangMem, Memobase, supermemory, HippoRAG 2, LongMemEval, Omi (ideas cited, nothing copied); README "What was built" row for each day of work
- [ ] 9.4 The owner asks ten real questions about their own week by text and by voice and judges speed and answers [human]
