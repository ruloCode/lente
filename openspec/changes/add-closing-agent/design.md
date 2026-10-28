# Design

## Context

Muse Spark 1.3 supports function calling and structured output over Chat Completions (documented; to be verified with one real call before building on it). The hub has no agent loop yet; it calls models directly in `src/pilot.ts`. Meeting records with evidence ids come from `add-meeting-memory`.

## Goals / Non-Goals

**Goals:**
- A small, readable agent loop that judges can follow in one file: plan → validate → propose → (approve) → act → trace.
- Deterministic safety: approval and grounding enforced in code.

**Non-Goals:**
- A general agent framework, multi-agent orchestration, or long-running background autonomy.

## Decisions

1. **Own loop over a framework.** A ~150-line loop with a tool registry (`name`, JSON schema, `effect: "none" | "external"`, handler). Tools with `effect: "external"` are queued as proposals instead of executed. Alternative: an agent framework from Meta's "Agent frameworks" docs; rejected to keep zero runtime dependencies and full visibility of each step.
2. **Two-phase run.** Phase 1 (plan) may call only read-only tools (meeting record, glossary, task list) and must end with a `propose_actions` structured result. Phase 2 (act) runs one approved action at a time. This makes "nothing runs unapproved" a property of the code path.
3. **Evidence as a schema field.** `propose_actions` requires `evidence: turnId[]` per action; the hub resolves ids against the meeting and drops the rest before the phone sees them.
4. **Traces as JSONL**, one line per step, in `data/traces/<meetingId>.jsonl`, the same append-only pattern as the day record, so the trace viewer and the evals read the same file.
5. **External tools through MCP.** The MCP client from `add-glasses-mcp` lists tools from configured servers; they join the registry as `effect: "external"`.

## Risks / Trade-offs

- [Function-calling format differs from OpenAI's] → verify with one call first (task 1.1); the loop isolates the format in one adapter.
- [Agent proposes too many or trivial actions] → cap at five proposals, rank by evidence count; measured in evals.
- [Email quality varies] → the draft is always editable before approval, and the wearer's profile phrasing is in context.
