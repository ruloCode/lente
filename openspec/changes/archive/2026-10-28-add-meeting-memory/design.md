# Design

## Context

The hub already appends every turn, cue and summary to `data/days/<date>.jsonl` (see `day-record`). Muse Spark 1.3 supports structured output and prompt caching (cached input is billed at $0.15 per million tokens versus $1.25 uncached). Retrieval-augmented generation is on the hackathon's list of generic projects to avoid.

## Goals / Non-Goals

**Goals:**
- Memory that fits in context: the whole profile and every meeting summary go into the prompt as a stable, cacheable prefix.
- Every extracted item carries the turn ids that support it.

**Non-Goals:**
- Vector search, embeddings, or an external database.
- Multi-user or cross-device sync.

## Decisions

1. **Files, not a database.** `data/meetings/<id>.json` per meeting (turns are references into the day log plus the extracted record) and `data/language.json` (glossary; `data/profile.json` already holds the wearer's names and settings). Plain JSON keeps judges able to read it and needs no dependency. Alternative: `node:sqlite`; deferred until queries outgrow a file scan (measure first).
2. **Long context with caching instead of RAG.** The memory prefix (profile, then meeting summaries oldest first) only grows at the end, so earlier bytes stay identical between calls and remain cacheable. Alternative: embeddings + top-k; rejected for being the generic pattern and for the dependency.
3. **Structured output with a JSON schema** for extraction and briefing; the hub validates the result and drops items whose evidence ids do not exist (this enforces "grounded" in code, not in the prompt).
4. **Extraction runs once at meeting end**, off the live path, so it never delays cues.

## Risks / Trade-offs

- [Memory grows beyond the context window] → summaries are capped at two sentences; when the prefix passes a budget (to measure), the oldest meetings collapse into a monthly digest.
- [Model drops evidence ids] → items without valid ids are dropped and counted in the trace; the count is part of the evals.
- [Cache hit rate lower than expected] → measured via `usage` cached tokens and reported in docs/benchmarks.md.

## Open Questions

- The token budget for the memory prefix is set after measuring a real week of meetings.
