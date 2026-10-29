# Proposal

## Why

Lente's wearer thinks in Spanish and works in English. Today the hub treats English as the default: transcription is biased English first, meeting notes come out in whatever language the meeting was held in, and an English "Dilo" line arrives with nothing that says what it means. The owner asked for Spanish as Lente's primary language, with English fully supported: what the wearer reads is in Spanish, what the wearer says stays in the language of the meeting.

## What Changes

- Transcription bias lists Spanish first, then English (`languageBias: ["Spanish", "English"]`; it is a hint, so English meetings keep working).
- The "Dilo" reply stays in the language of the question, so the wearer can say it as is. When that language is not Spanish, the same model call also returns a short Spanish meaning, and the cue carries both.
- The phone shows the Spanish meaning under the line, smaller and muted, only when there is one. Narration speaks only the line to say.
- Meeting notes (summary, decisions, commitments, open questions) are written in Spanish whatever the meeting language; names, product terms and quoted words stay as they were said. The glossary already gives meanings in Spanish.
- Phone copy, the day summary, Mirar and En vivo are already Spanish (`PILOT_LANG` defaults to Spanish) and don't change.

Out of scope: translating the follow-up email the closing agent drafts (it stays in the meeting's language), languages other than Spanish and English.

Meta models: Muse Voice Transcribe (language bias), Muse Spark 1.3 (reply with meaning, notes).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `live-transcription`: Spanish-first language bias.
- `reply-cues`: a Spanish meaning alongside a reply in another language.
- `meeting-memory`: notes written in Spanish.
- `companion-app`: the Dilo card shows the Spanish meaning.

## Impact

- `src/asr-session.ts`, `src/pilot.ts` (bias order, cue payload), `src/briefing.ts` (reply prompt and parsing), `src/meetings.ts` (notes prompt), `src/pilot-page.ts` (card).
- The reply gains a second field, so its latency is measured before and after (`pnpm eval`) and recorded in `docs/benchmarks.md`.
