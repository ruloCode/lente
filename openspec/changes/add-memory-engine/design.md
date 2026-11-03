# Design

## Context

### Where the memory comes from today

- **The clip.** It streams audio, and frames when asked, to the wearer's runtime (`add-accounts` decision 9).
- **Turns.** Muse Voice Transcribe turns them into turns. They land in a meeting, or in an automatic episode in Solo grabar (`episodeEnd`: 5 min of silence or 60 min of length), and in the day record.
- **Camera descriptions** go to the day record.
- **When a meeting ends**, one notes call writes the title, summary, decisions, commitments, open questions and proposed facts.
- **Overnight**, `src/nightly.ts` writes the day, week and month digests. The profile is rewritten after each meeting.
- **Storage.** Everything is sealed with the wearer's data key. The database sees only ids, times, kinds and counts (`add-accounts` decision 6).

### How a question is answered today

- **Production** (`askWhole` → `src/ask-tiers.ts`):
  1. Build a 60,000-character context: profile, digests and the newest meeting notes.
  2. Plan call (structured, not streamed).
  3. The hub opens the meetings and days the plan named and ranks their turns by how many plan terms they contain.
  4. Answer call (structured, not streamed).
- **Laptop** (`src/ask.ts`): one structured call over a 60,000-character window of the last 7 days.
- **Voice** (`src/voice-agent.ts`): the `ask_memory` tool calls the same function, nested inside the voice loop.

### Measured baseline (scratch probe, 2026-11-03)

Setup: synthetic memory with two projects, 12 meetings of 24 turns and 14 day digests. Muse Spark 1.3 at minimal effort, over Chat Completions, on home Wi-Fi. The probe was not committed; task 1.1 turns it into `pnpm bench:ask`.

| Path | n | p50 | p90 | Notes |
|---|---|---|---|---|
| Production, two calls | 10 | 6.8 s | 13.6 s | The plan call alone took 1.5–6.2 s; cached tokens were 0 on most calls |
| Laptop, one call | 10 | 3.5 s | 5.3 s | 7.3k prompt tokens; "not found" in 2 of 2 runs when the reply hit the 500-token cap |
| Production in a project, out-of-project question | 2 | 6.2–6.8 s | — | Declined both times, but the other project's digests were in the prompt |

### Constraints

- **Sealed storage.** Postgres cannot search content, and the question must never reach the database (`add-accounts` decision 7).
- **One container** (`max_containers=1`) holds every listening runtime, so memory per user matters (`add-accounts` 6.4).
- **No embedding model in the Meta API.** Vectors are decided (decision 7), so the encoder comes from elsewhere. `GET /v1/models` lists `muse-spark-1.3`, `muse-spark-1.2`, `muse-spark-1.1`, `muse-wonder-1.0`, `muse-voice-transcribe-1.0`, `muse-image-1.0`, `sam-3.1` and the contributor models (checked 2026-11-03).
- **Zero runtime dependencies** unless one earns its place. Every number is measured.
- **Prompt caching on the Responses API** works when the shared prefix is the first developer message, not the `instructions` field: 1,649 of 1,717 tokens cached (`docs/kb/meta-api.md`, 2026-11-02).

## Goals / Non-Goals

### Goals

- Answers start fast. Targets: the first text token of a chat answer within 1.2 s p50, and the first spoken sentence of a voice memory answer within 1.5 s p50 after `speechComplete`. Both are measured by `pnpm bench:ask` and `pnpm bench:voice`.
- Retrieval runs in the runtime, with no model call. Target: ≤ 30 ms p95 over 90 days of all-day recording, and ≤ 150 ms p95 over 365 days.
- Project scope holds in the data. No record, card, brief or digest from another project reaches the model.
- A full day of recording is searchable within seconds as segments, and as memory cards within minutes, with no wait at question time.
- Answers quote the concrete line ("18 mil dólares", the date), not a digest's paraphrase, and cite it.

### Non-Goals

- Searching in Postgres (no tsvector or pgvector on plain content).
- A graph database. Extraction is LLM-heavy, and published graph systems trade indexing cost for multi-hop recall that Lente has not shown it needs (Microsoft GraphRAG is in maintenance mode, by its own README).
- Cross-encoder reranking on the voice path (LightRAG warns rerankers add 1–2 s).
- Storing audio or video (`add-media-archive`).

## Decisions

### 1. Retrieval leaves the model's path; one streamed call answers

The plan call is the slowest step and the least reliable one. The probe measured 1.5–6.2 s, and its terms decided what could be found. It is replaced by local retrieval:

- **Parse the question** in pure code: time phrases, people, project, and terms with stopwords dropped.
- **Search the wearer's index:** decision 2.
- **Answer once** with a single streamed Responses call.

**Prompt order for the answer call**, so the cache is shared:

1. Developer message: the rules. Static, the same for every user and every question.
2. Developer message: the memory prefix.
   - Whole memory: the profile, people cards, the last 7 day digests and the week digests.
   - In a project: that project's brief, its people cards and its last 7 days of cards.
   - It changes only after consolidation, so it caches per user.
3. Developer message: "RECUPERADO", the retrieved lines with their ids (≤ 6,000 tokens for text, ≤ 2,500 for voice).
4. The last 8 messages of the conversation.
5. The question.

**The answer streams as plain text**, not structured JSON:

- **Header.** It opens with one of `@answer`, `@none` or `@command`.
  - `@command` is followed by one JSON object `{agent, instruction}`. This is the existing agent-bridge contract (`COMMAND_RULE`), never shown as an answer.
  - `@none` becomes `NOT_FOUND` on the phone.
- **Citations.** The text after `@answer` carries `[[id]]` markers after the claims they support. A streaming parser in `src/recall.ts`:
  - forwards the text with the markers stripped;
  - emits a `source` event for each id that exists in what was shown;
  - drops ids that don't exist.
- **After the stream.** If the answer cited ids and none was real, the hub sends a `replace` event with `NOT_FOUND`, matching today's rule in `parseAsk`. Small talk carries no ids and is kept.
- **Length.** The answer is ≤ 3 sentences. `max_output_tokens` is 600 (effort minimal). A reply cut off by the length limit keeps what streamed and ends with «…». It is never turned into "not found" (the probe's bug).

**Rejected:**
- Streaming structured output. It is unverified on Meta's API, and the answer text sits inside JSON until the closing brace.
- Keeping the plan call and running it in parallel with the answer. The answer would still need the plan's lookups.

### 2. One index per wearer, in the runtime, built from what the hub already decrypts

`src/memory-index.ts` is pure, with no I/O.

**Units.** Each unit has an id that today's chips already understand:

| Unit | Id | From | Text indexed |
|---|---|---|---|
| Segment | `s<meeting id>:<n>` in a meeting, `s<YYYY-MM-DD>:<n>` for speech outside meetings (refs the turn ids it covers, e.g. `m…:t5–t9`); numbered per meeting or day so re-indexing one never renumbers another | Turns, grouped by decision 4 | The turns, with speakers |
| Seen | `d<day>:<n>` (as today) | Camera descriptions | The description |
| Notes | `m…` | Meeting notes | Summary, decisions, commitments |
| Card | `c<episode id>:<n>` | Memory cards (decision 5) | Summary, facts, people, bilingual keys |
| Fact | `F<id>` | Kept facts | The fact |
| Digest | `day:…`, `week:…`, `month:…`, `profile:…`, `brief:<project>`, `person:<key>` | Digests, briefs, people cards | The text |

**Fields per unit:** id, kind, `at` (start) and `to`, project id, speakers, people mentioned, and validity (`validFrom` and `validTo` for card facts).

**Lexical ranking:**
- BM25 (k1 1.2, b 0.75) over accent-folded, lowercased terms with ES/EN stopwords removed and a light suffix fold. The fold is shared with the planned blind index (`add-accounts` decision 7), so both tokenize alike.
- Postings are per shard.

**Vector ranking** (the encoder from decision 7):
- One int8 vector per unit, plus a 1-bit code.
- Search is brute force: Hamming distance on the codes for the top 200, then an exact int8 dot product. No ANN graph: at these sizes, brute force over packed bits stays within the targets (to measure in 2.4), and it needs no dependency.

**Filters, applied before ranking:**
- Project: the scope from the request, or a project named in the question.
- Time range: from `src/time-phrases.ts`.
- Speaker or person: a name that matches the people list.
- Validity: "now" questions see only facts that are currently valid.

**Fusion:**
- Reciprocal rank fusion with k = 60 across the lexical, vector, people and time lists.
  - The people list is the lexical ranking restricted to the named person when the question has words, so the person's relevant line leads, not just their newest one (measured in 3.4: newest-first lost the 18,000-dollar line to a newer meeting).
  - The time list holds a named range's notes, cards and facts, where commitments and decisions are written whatever words the question used (measured in 3.5: «¿Qué prometí entregar esta semana?» went from 0/5 to 5/5).
- A small recency prior on top: half-life 30 days, off when the question names a time.
- Units that match a named person get a boost.

**Context expansion.** Each top segment brings its neighbours (±1 segment), so a quote keeps its question and its reply.

**Confidence.** Fused scores are ranks, not evidence, so confidence is read from the top 3 fused units: a lexical hit that holds at least `RECALL_MIN_SCORE` (0.5) of the question's distinct terms, or a vector hit at least `VECTOR_MIN_SIMILARITY` close. When neither holds and no person or time matched, or when the parser marks the question as an aggregate («todo», «resume», «cuántas veces», «everything»), the request takes the deep path (decision 8).

**Rejected:**
- Postgres FTS or pgvector. The database would need plain content, against decision 6 of `add-accounts`.
- sqlite-vec or LanceDB in the hub. A native dependency, and their storage would be plain on disk.
- Decrypting the whole history per question. `add-accounts` decision 7 already rejects it, and the index keeps a compact form instead.

### 3. Shards in memory, persisted only as sealed snapshots

**Shards.**
- The index is sharded by month.
- The current and previous two months are hot: kept in RAM while the runtime lives.
- Older shards load lazily when a time filter or the deep path needs them, with an LRU of 3, and are dropped at eviction.

**Snapshots.**
- Each shard serializes to a compact binary: term dictionary, postings, unit table and vectors.
- It is sealed with the user's data key, with AAD `memory_snapshots / blob / user / shard`.
- It is written behind to a `memory_snapshots` row (`user_id`, `shard` as `YYYY-MM`, `format_version`, `encoder` id or `lexical`, `built_through` timestamp, sealed `blob`).
- Writes happen every 10 minutes when dirty, and at eviction before the data key is dropped.

**Opening.** When the runtime opens, it loads the hot snapshots. It then replays the records newer than `built_through`, read by time through plain columns as today, and decrypts them in memory.

**Rebuilds.** A change of format or encoder rebuilds the shard in the background from the sealed records. Until the rebuild finishes, queries use lexical ranking only.

**Laptop mode** writes the same sealed format to `data/memory/<shard>.bin`, with the local key.

**Measured in 2.4** (`docs/benchmarks.md`): 90 days query in 12 ms p95 lexical and 21 ms with 384-dimension vectors; 365 days in 48 ms and 93 ms. A hot quarter with vectors adds about 340 MB of RSS, mostly postings and text. So the three hot months stand on latency, and memory is what may shrink the window to one month (see Risks).

**Arithmetic before 2.4, kept for comparison:**
- Size. About 150 spoken words a minute for 8 h is about 72k words a day. At about 60 words per segment, that is about 1,200 segments a day and about 0.44 M a year.
- Vectors. At 384 dimensions, int8 is 384 B and the 1-bit code is 48 B, so a hot quarter is about 110k units and about 47 MB with codes.
- Text. Unit text is not kept in RAM for cold shards; it is reopened from the sealed records when shown.

### 4. Segments: searchable within seconds, with no model call

`segmentTurns` in `src/consolidate.ts` is pure.

**It closes a segment** on any of these:
- a pause of 8 s or more;
- a change in the set of speakers, once the segment has run 20 s;
- 40 s of length;
- a meeting or episode boundary.

**Indexing.**
- A segment carries the turn ids it covers and is added to the hot shard as soon as it closes.
- Segment embeddings are computed in batches every 5 s.
- Camera descriptions index as `seen` units when they arrive.
- So the question "what did she just say?" works during the meeting.

### 5. Memory cards: one structured call per episode, with bilingual keys

**For a meeting or Solo grabar episode**, the existing notes call (`NOTES_PROMPT`) gains these fields, in the same call:
- `people` (name and role);
- `facts`, each with:
  - `text`;
  - `about` (people or project);
  - `evidence` (turn ids);
  - `valid_from` (when it became true, if said);
  - `supersedes` (the id of an existing fact it replaces, or empty);
- `keys_es` and `keys_en`: up to 12 short search keys each. These are names, topics, numbers with their unit, and what the wearer would type, in both languages.

**For a long episode**, every 10 minutes while it runs, a window card covers the last 10 minutes with the same fields. It uses a separate call, so a 60-minute recording is searchable as cards before it ends. Window cards are skipped while idle pause or the silence gate holds the stream.

**Supersession, append-only:**
- The call is shown the up to 5 existing card facts that best match the new episode, retrieved locally, each with its id.
- A new fact that names one of them in `supersedes` closes the old fact's validity at the new fact's `valid_from`, or at the episode's start.
- Nothing is deleted.
- Kept facts, which the wearer confirmed, are never superseded automatically. They win, as in the profile.
- Ids are validated: evidence must be real turns, and `supersedes` must be a fact that was shown.

**Why bilingual keys:**
- The wearer asks in Spanish about meetings held in English. Lexical search cannot match «presupuesto» to "budget".
- Writing the keys at consolidation moves the cross-lingual work from question time, where today's plan call does it, to write time, where nobody waits.
- They are also the lexical half of the hybrid ranking, and the baseline the vectors are measured against. The idea of fact-augmented keys comes from LongMemEval's key expansion.

### 6. Briefs and people cards in the background

**Project brief:**
- ≤ 2,000 characters per project, holding what the project is, who is in it, its current state, open commitments and recent decisions, with source ids.
- Rewritten from the last brief plus the new cards in that project, at most once every 30 minutes, and in the nightly run.

**People card:**
- ≤ 600 characters for a person seen in at least 2 episodes: who they are to the wearer, what they own, and recent commitments either way.
- Rewritten nightly.

**Both:**
- Use Muse Spark 1.3 structured output, sealed under the `digests` table's scheme as new scopes `brief` and `person`.
- Are counted by the usage meter and held by the spend cap (`add-accounts` 6.3).
- Make up the memory prefix (decision 1). Many questions ("¿en qué quedamos con Ana?") are answered from the prefix and one retrieved quote.

This follows the "sleep-time" pattern (Letta) and the profile/timeline split (Memobase, supermemory): write while idle so reading is cheap.

### 7. Vectors always; a bake-off picks the encoder

The owner decided on 2026-11-03 that the index has vectors (`docs/kb/decisions.md`, "Vectors in the memory index"). The measurement decides which encoder, not whether.

**Why vectors.**
- Wearers ask in Spanish about meetings held in English, and in their own words ("lo de la plata para anuncios" for "marketing budget").
- Lexical search and bilingual keys catch names, numbers and the words a card thought of. Vectors catch the paraphrases nobody thought of.
- The two lists are fused (decision 2), so neither has to be right alone.

**The set.** `scripts/eval/recall-set.ts`: synthetic bilingual meetings in English and Spanish, invented and with no real people. About 120 questions:
- paraphrases;
- cross-lingual questions;
- names and numbers;
- time questions;
- out-of-memory questions.

Each question is labelled with the segment ids that answer it.

**What is measured:**

| Configuration | What it needs |
|---|---|
| **A.** Lexical BM25 plus bilingual card keys (baseline, not a candidate) | No dependency |
| **B.** A small multilingual text encoder run in the hub on CPU (ONNX), fused with A | One native runtime dependency |
| **C.** A Meta open-weights encoder served on Modal, fused with A | A network hop and a Modal function. Meta FAIR's SONAR encoders are one family to check. Licence and fit are verified in task 8.1, not assumed. |

**The measures:**
- recall@10 and MRR, for all questions and for the cross-lingual subset;
- query embedding time, p50 and p95, from the hub;
- embedding throughput per segment;
- RSS added per 100k units.

**Selection rule:**
- **The limits.** A candidate qualifies when query embedding is at or under 50 ms p95 from the hub and added RSS is at or under 300 MB per 100k units.
- **Meta first.** Among qualifying candidates, C wins if its cross-lingual recall@10 is within 3 points of B's. Otherwise the one with the higher cross-lingual recall@10 wins.
- **Neither qualifies.** The faster one ships with a smaller dimension (a truncated or smaller variant), and the numbers go to the owner before group 8 closes.
- **The record.** `docs/kb/decisions.md` gets the numbers, the encoder, and, for B, the dependency and why the zero-dependency alternative (A alone) was not enough.

**Embeddings are content.**
- They are sealed inside snapshots, never stored or logged in plain text, and never sent anywhere except to the encoder.
- The Modal encoder for C runs in the same Modal app as the hub, so text to embed never leaves Lente's own infrastructure.
- It receives one text and returns one vector, and logs neither.

**Rebuilds.** A change of encoder rebuilds the shards in the background (decision 3). Lexical ranking answers until a shard is done.

### 8. The deep path keeps today's tiers for questions retrieval cannot answer alone

- **When.** Aggregates, low confidence (decision 2), and questions about the profile itself.
- **What it runs.** `askTiers`, with two changes:
  - the memory prefix moves to the first developer message, so the plan and answer calls share a cache;
  - in a project, the context is that project's brief and cards instead of the global digests.
- **On the phone.** «Buscando más…» appears at once, and the answer streams when it comes.
- **Target.** About 1 in 10 questions in the eval, measured.

### 9. Voice: preload, speculative recall, and a tool that returns lines

**Session preload.** When a voice session opens, its cached prefix gets the memory prefix of decision 1: the project's prefix if the session started inside one, otherwise the whole memory's.

**Speculative recall:**
- On every transcription `partial`, debounced to 150 ms, the runtime runs retrieval on the partial text. This takes milliseconds and calls no model.
- At `speechComplete` it runs once more on the final text.
- If the top score passes `RECALL_MIN_SCORE`, the up to 6 best lines go into one developer item before the wearer's turn.
- The voice model answers in its first step, citing `[[id]]`. The hub removes the markers from what is spoken and shows them as chips (the existing `memorySources` path).

**`ask_memory` returns lines** (retrieval with an optional time or person filter), not a nested answer. The voice model answers from them in its next step, which is one model step instead of three.

**Speaking order.** The first spoken sentence is the answer, not a commentary, when the lines were already attached.

**Measured in 5.4** (`docs/benchmarks.md`):
- In `ENDPOINTING` mode the transcription sends 5–6 partials per spoken question before `speechComplete`, so speculative recall runs on partials as planned.
- A request to have something done («Agrega…», «Recuérdame…») gets no lines, by a pure check on its first words (`looksLikeCommand`), even when it names a person.
- Memory questions went from about 10 s to 3.1 s p50 to the first answer sentence, mostly answered in the first step. Spark's own first token is what is left of the 1.5 s target.

### 10. Scope is a filter, and the fixes ship first

- **In a project**, every source is filtered:
  - retrieval units by `projectId`;
  - day entries kept only inside the time spans of that project's meetings and episodes;
  - the brief and people cards limited to that project;
  - no profile or global digest.
- **The fix for today, before the index exists:** `askWhole`, when scoped, passes only in-scope meeting notes and no global digests.
- **The truncation fix ships with it:**
  - `completeChat` returns `finish_reason`;
  - the ask paths raise their cap to the structured calls' 1,500 tokens;
  - a reply cut off by length is retried once at double the cap, or reported as failed, never as "not found".

## Latency budget (targets; measured values go to `docs/benchmarks.md`)

| Step | Text chat | Voice |
|---|---|---|
| Parse and retrieve, 90 days hot | ≤ 30 ms | ≤ 30 ms (already done during speech) |
| Prompt assembly | ≤ 5 ms | — |
| Model to first token, cached prefix | ≤ 1.1 s | ≤ 1.1 s |
| Hub → phone first text | ≤ 100 ms | first sentence to TTS ≤ 1.5 s after `speechComplete` |

## Prior art (ideas only; cited in README "Related work", nothing copied)

| Idea | Where it comes from |
|---|---|
| No LLM call before retrieval; consolidate in the background | Letta sleep-time agents; LangMem background formation; Memobase buffer and flush |
| Raw episodes as the source of truth; derived facts point back to them | Zep/Graphiti episode subgraph; HippoRAG passage nodes; Omi conversations |
| Hybrid lexical plus vector, fused by reciprocal rank | Supabase hybrid search guide; LanceDB; mem0 v2 retrieval |
| Scope as a hard filter | pgvector iterative scans and partial indexes; MemOS memory cubes; LangMem namespaces |
| People as a retrieval signal | mem0 v2 entity layer; Graphiti entity nodes |
| Append-only facts with validity windows | Graphiti bi-temporal edges; mem0's move to add-only extraction |
| Profile and summaries answer most questions before search | Memobase profile and timeline; supermemory static and dynamic profile |
| Time words become a range before search | LongMemEval time-aware query expansion; Zep relative-date resolution |
| Index facts and keys as extra pointers to the raw chunk | LongMemEval fact-augmented key expansion |
| Small, fixed retrieval budget | Published operating points of 0.7k–7k tokens (Zep, mem0, supermemory) against 26k+ for full context |
| Episode boundaries by silence timeout | Omi's `conversation_timeout` |

The benchmark numbers these projects publish are their own claims and are not quoted as Lente's.

## Risks / Trade-offs

- **Memory per user in one container.**
  - Hot shards cost RAM for every listening user.
  - Mitigations: hot shards for listening users only, cold loading, and the capacity measure (`add-accounts` 6.4) gaining an index row.
  - If the numbers do not fit, the hot window shrinks to one month.
  - Measured in 2.4: about 340 MB per hot quarter with vectors, about 150 MB per month. Hot shards that drop their text (reopened from the sealed records, as cold shards do) are the next saving.
- **Streaming rules out JSON validation before display.** A wrong claim can show for a moment before `replace`. This is mitigated by sources streaming next to the text and by the eval's citation-accuracy check.
- **Window cards cost money in all-day recording.** They run only while speech flows, are capped by the spend cap, and skip silent windows. The cost per recorded hour is measured in 6.6.
- **Bilingual keys depend on the model.** The eval measures recall with and without them.
- **Two answer paths (fast and deep) can drift.** They share the rules, the citation parser and the eval.

## Migration Plan

1. Ship group 1, the bench and the two fixes, alone. It changes no stored data.
2. Build the index and the recall path behind `LENTE_RECALL=fast`, with tiers as the default, until the eval shows it is at least as accurate. Then flip the default.
3. Add the `memory_snapshots` migration. Runtimes without a snapshot build one from their records on open, which is measured for 30 and 365 days.
4. The card fields in the notes call are additive. Older meetings get cards from a catch-up in the nightly run, oldest first, capped like digests at 31 days per run.
5. Roll back by setting `LENTE_RECALL=tiers`. Snapshots can be dropped and rebuilt.

## Open Questions

- Does the Responses API stream fast enough with a 6,000-token retrieved block? Measured in 3.5: with 1,100–3,700-token prompts the first text took 2.7 s p50, mostly Spark 1.3's reasoning before its first word (150–250 tokens at minimal effort); shorter rules did not help. The 1.2 s target needs a faster first step (the fast lane) or less input, not less retrieval time.
- Can Muse Spark Open write memory cards as well as Spark 1.3? This depends on `add-fast-reply-lane`'s eval.
- Should "now" questions prefer card facts over raw segments, or show both? The eval decides.
