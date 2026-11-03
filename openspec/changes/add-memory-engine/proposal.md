# Proposal

Depends on: `add-accounts` (sealed stores, one runtime per user, digests). Shares the time-phrase parser with `add-memory-timeline` 3.1, so whichever lands first builds `src/time-phrases.ts`.

## Why

The wearer will record whole days. Today the chat and voice mode answer from that memory too slowly to feel like remembering:

- **Production chat (`askTiers`)** makes two sequential, non-streamed Muse Spark calls per question: a lookup plan, then the answer.
- **Measured 2026-11-03** with a scratch probe on synthetic memory (two projects, 12 meetings, 14 day digests; Muse Spark 1.3 at minimal effort; Chat Completions; home Wi-Fi; n=10 per path):
  - Production path: p50 6.8 s, p90 13.6 s. The plan call alone took 1.5–6.2 s.
  - Laptop single-call path (`ask`): p50 3.5 s, p90 5.3 s.
- **Voice** (`docs/benchmarks.md`, 2026-11-02): `ask_memory` reached the first answer sentence at 3.4 s p50 (n=2, one meeting in memory). The tool nests the same two calls inside the voice loop's two model steps.

The same probe found correctness gaps:

- **Truncated answers become "not found".** The laptop path answered «¿Qué prometí entregar esta semana?» with "No lo encuentro" in 2 of 2 runs. The reply hit its 500-token cap (reasoning plus JSON), and the truncated JSON is parsed as not found.
- **The key fact never surfaced.** Neither path gave the 18,000-dollar figure for «¿Qué dijo Ana sobre el presupuesto de marketing?» in 4 tries. The production path answered from a day digest's paraphrase.
- **Project scope is only partly enforced.**
  - Meetings outside the project are filtered out.
  - The profile and the day, week and month digests still go to the model unscoped, and the scoped question only gains a «(Sobre el proyecto …)» prefix.
  - The probe's out-of-project question was declined in 2 of 2 runs, so the model obeyed. Isolation still rests on the prompt, not on the data.
- **The two calls never share a cached prefix.** Each puts its own instructions before the memory, so most calls showed 0 cached tokens.

The model is the bottleneck: endpointing takes 0.3 s and the rest is model steps (`docs/benchmarks.md`). The fix is to take the model off the retrieval path:

- **Retrieve locally.** Finding the right lines happens in the wearer's runtime, in milliseconds, with no model call.
- **Answer once.** A single streamed call answers from those lines.
- **Do the heavy work in the background.** Consolidation runs while the wearer records, not while they wait.

Prior art in open-source agent memory (mem0, Letta, Zep/Graphiti, LangMem, Memobase, supermemory, HippoRAG 2, Omi) converges on the same split. Their published retrieval budgets are about 0.7–7k tokens, against 26k or more for full context. Lente takes the ideas only, written fresh, and cites them in README "Related work" and `design.md`.

## What Changes

- **One streamed answer per question.** Retrieval in the runtime replaces the plan call. The answer streams over the Responses API with citation markers that are checked as they arrive. The stable memory prefix goes first as a developer message, so repeat questions hit the prompt cache.
- **A memory index per wearer, in the runtime.**
  - Units: segments of speech (about 20–40 s of one conversation), camera descriptions, meeting notes, kept facts, memory cards and digests.
  - Ranking: hybrid. Lexical BM25 over accent-folded terms, plus vector similarity from a multilingual text encoder. The two are fused by reciprocal rank, and a match on people's names adds a boost.
  - Hard filters before ranking: project, time range and speaker.
  - Storage: built and searched in memory. Persisted only as sealed snapshots, so the database never sees a term, a vector or a question.
- **The question parsed locally, with no model call.** Time phrases («ayer», «el martes», «la semana pasada», "last Tuesday"), people's names from the speaker and entity lists, and project names become filters.
- **Hard project scope.** In a project, only that project's records, cards and project brief reach the model. The global profile and digests never do.
- **Consolidation in three layers while recording.**
  - **Segments:** searchable within seconds, with no model call.
  - **Memory cards per episode:** one Muse Spark structured call when an episode closes, or every 10 minutes during a long one. Each card holds a title, summary, people, facts, commitments and bilingual search keys.
  - **Background refresh:** project briefs and people cards are refreshed between episodes and in the nightly run.
  - Facts are append-only, with validity windows. A new fact supersedes an old one and never deletes it.
- **Voice without the extra round trips.**
  - When a session opens, its cached prefix gets the profile (or the project brief), today's digest and the people cards.
  - While the wearer speaks, retrieval runs on the partial transcript. At `speechComplete` the best lines are attached to the turn, so most memory questions are answered in one model step.
  - `ask_memory` stays for deep questions. It returns lines for the voice model to answer from, not a nested answer.
- **A deep path kept for hard questions.** Aggregates ("todo lo que hablé con Ana este mes") and low-confidence retrieval fall back to the tiered plan (`askTiers`). The phone shows «Buscando más…» first.
- **Vector recall (owner's decision, 2026-11-03).**
  - Every unit gets an embedding, sealed with the rest of the memory. Vectors and lexical ranking always run together.
  - A bake-off picks which encoder: a small multilingual encoder run in the hub, or a Meta open-weights encoder served on Modal.
  - Measures: recall@10 on a bilingual synthetic set (Spanish questions over English meetings), latency per query and per segment, and memory per 100k segments. Lexical search alone is measured too, as the baseline the vectors are compared against.
  - The Meta Model API offers no embedding model (`GET /v1/models`, checked 2026-11-03), so the encoder is the one model in Lente that is not served by Meta's API.
- **Fixes that ship first.** The truncation that turns answers into "not found", and the unscoped digests in project questions.
- **`pnpm bench:ask`.** Measures the text and voice paths on synthetic memory at 1 day, 30 days and 365 days of recording. Results go to `docs/benchmarks.md`.

Out of scope for the hackathon (before 2026-11-04 21:00 ET): all of it. This is Phase 3 work. Group 1, the bench and the two fixes, may land earlier if the owner asks.

Also out of scope:
- Storing audio or video (`add-media-archive`).
- A graph database.
- Cross-encoder reranking on the voice path.
- Searching in the database.

Meta models:
- Muse Spark 1.3 for the streamed answer, memory cards, project briefs and people cards (structured output, prompt caching).
- Muse Voice Transcribe partials for speculative recall.
- Muse Spark Open for memory cards if the fast-lane eval (`add-fast-reply-lane`) shows it is good enough.
- No Meta API model embeds text. The bake-off picks between a Meta open-weights encoder served on Modal (preferred when it is within the limits) and a non-Meta encoder run in the hub.

Privacy:
- **No new content leaves the hub.** The index, the vectors and the cards are content, so they are sealed with the wearer's data key like everything else.
- **Persisted only as ciphertext.** Snapshots go to the database as sealed blobs. Embeddings are never stored in plain text, because they leak meaning (`add-accounts` decision 7).
- **Questions stay in the runtime.** They never reach the database or a log line in accounts mode.
- **The model sees no more than today.** Retrieval sends only the matched lines, so it sees less of the memory per question, not more.

## Capabilities

### New Capabilities
- `memory-recall`: answering a question from the wearer's whole memory or one project's, by text or voice, from local retrieval and one streamed model call, with validated sources and hard scope.
- `memory-consolidation`: turning the continuous record into segments, memory cards, project briefs and people cards while the wearer records, with append-only facts and validity windows.

### Modified Capabilities
- None archived yet: `ask-lente` and voice mode are still open changes. Their tasks note that this change replaces the plan step.

## Impact

- **New pure modules, each with a test:**
  - `src/memory-index.ts`: segments, BM25, fusion, filters, snapshot codec.
  - `src/recall.ts`: question parsing, retrieval, prompt assembly, streamed citation parsing.
  - `src/consolidate.ts`: segmenter, card schema, fact supersession.
  - `src/time-phrases.ts`, shared with `add-memory-timeline`.
- **Edges:**
  - `src/pilot.ts`: runtime wiring, `/ask` streaming over SSE, consolidation triggers.
  - `src/voice-hub.ts` and `src/voice-agent.ts`: session preload, speculative recall, `ask_memory` returning lines.
  - `src/supabase-stores.ts` and `src/stores.ts`: sealed `memory_snapshots` and `memory_cards`.
  - One migration.
- **Clients:** streamed answers in `android/` (Chat) and `/app` (web desktop), which already render chips.
- **Benchmarks:** `scripts/bench-ask.ts`, and `scripts/eval/` gains a bilingual recall set.
- **Docs:**
  - `docs/kb/decisions.md`: "Vectors in the memory index" (2026-11-03) supersedes "Memory as files and long context, not RAG" and `add-accounts` decision 7's rejection of embeddings. The bake-off adds the chosen encoder and its dependency to it.
  - `docs/benchmarks.md`.
  - README "Related work".
