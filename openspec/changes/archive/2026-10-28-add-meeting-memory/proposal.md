# Proposal

## Why

Today the day record is a flat list of turns. A second-language professional needs three things from it that no competitor gives together: what was agreed and who owes what, which words and questions tripped them up, and a short brief before the next meeting with the same people. This turns Lente from a live helper into a personal assistant that gets better with every meeting.

## What Changes

- Meetings as episodes: start and end from the phone (with an automatic end after a long silence), each with its turns, participants by label, decisions, commitments with owners, and open questions extracted by Muse Spark 1.3 when it ends.
- A language profile: terms and idioms from each meeting that a non-native speaker may not know, with a one-line meaning in Spanish and an example, plus how often the wearer was asked and answered.
- A briefing card on demand before a meeting: who is likely there, what the wearer owes them, the open questions, and three phrases worth having ready.
- Cues use the language profile to prefer words the wearer already uses.

Out of scope before 2026-11-04: calendar sync (the briefing takes a title and names typed or spoken on the phone), shared team memory, spaced-repetition coaching (planned as a later change).

Meta models: Muse Spark 1.3 with structured output for extraction and the briefing; prompt caching for the long, stable memory prefix.

Privacy: only text derived from meetings is stored, locally, in git-ignored files; the wearer can delete a meeting or the whole memory from the phone.

## Capabilities

### New Capabilities
- `meeting-memory`: meetings as episodes with decisions, commitments and open questions.
- `language-profile`: the wearer's personal glossary and answer statistics.
- `briefing`: a prep card before a meeting, built from memory.

### Modified Capabilities
- `reply-cues`: replies draw on the language profile.

## Impact

- New hub modules for meetings, profile and briefing (pure parts tested), `data/meetings/` and `data/profile.json` (git-ignored).
- Phone page: Start/End meeting, a meeting view, the glossary, the briefing card, delete controls.
- Depends on `add-addressed-to-you` for "asked vs answered" statistics.
