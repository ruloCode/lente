# Proposal

## Why

Lente remembers every meeting as text with evidence, but the only way to use that memory today is the briefing before a meeting. The questions a second-language professional actually has come at any time, often mid-meeting: "what did Ana say about the deadline last week?", "what did I promise the client?", "what does 'ballpark' mean again?". Omi (cited in README "Related work") shows that asking your own memory is one of the most used features of a wearable memory. Lente's version is narrow on purpose: it answers only from the wearer's meetings, cites the meeting and turn behind every answer, says so when the memory doesn't support one, and can be asked by voice through the clip without touching the phone.

It is not a general chatbot: questions outside the wearer's meetings are declined. Product pattern only; written fresh, nothing reused.

## What Changes

- "Preguntar" on the phone: a question box and the answers of this session; each answer is in Spanish, at most three sentences, with chips for the meetings it relies on that open the meeting detail at the cited turn.
- By voice: when the wearer says "Lente, …" followed by a question, the hub answers it instead of treating it as a meeting question; the answer appears in the reply slot labelled Lente and is spoken in Spanish.
- One Muse Spark 1.3 call per question, with the memory as the cached prefix (meeting notes, transcripts that fit, glossary) and structured output: answer, cited meeting and turn ids, or "not in memory".
- Answers that cite nothing, or cite turns that don't exist, are replaced by "No lo encuentro en tus reuniones."
- A grounding eval: questions over the synthetic eval meetings, some answerable and some not; accuracy, refusals and latency recorded in `docs/benchmarks.md`.

Out of scope: questions about the live camera (Mirar does that), actions (the closing agent does those), keeping answers across sessions.

Meta models: Muse Spark 1.3 (structured output, prompt caching).

## Capabilities

### New Capabilities
- `ask-lente`: grounded questions to the wearer's meeting memory, by text or voice.

### Modified Capabilities
- `companion-app`: the Preguntar screen and Lente answers in the reply slot.

## Impact

- New `src/ask.ts` (prompt, validation of citations, pure), `src/pilot.ts` (route, voice trigger), `src/pilot-page.ts` (Preguntar), `scripts/eval/` (grounding set).
