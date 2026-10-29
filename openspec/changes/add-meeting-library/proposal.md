# Proposal

## Why

Lente already keeps each meeting's notes with evidence, but Reuniones is a flat list: no title unless the wearer typed one, no way to open a meeting, read its transcript, find something said last week, or send the notes to someone. Memory apps for wearables (Omi, cited in README "Related work") show how much a good library matters: a titled, dated, searchable list and a detail page are what make the memory usable after the meeting. Lente's version keeps its own angle: every item links to the turn that supports it, and the notes are in Spanish while quotes stay as said.

Product patterns only; written fresh, nothing reused.

## What Changes

- The notes extraction also returns a short title (Spanish, at most 60 characters) and one topic tag from a fixed list, in the same Muse Spark 1.3 call. A title the wearer typed always wins.
- Reuniones shows each meeting as a card: title, topic chip, date, time range, duration and the one-line summary.
- A meeting detail screen: title, date/time/duration chips, then Resumen, Decisiones, Compromisos, Preguntas abiertas and Glosario; every item opens the Transcripción tab at the turn it cites. Share sends the notes as plain text (Web Share, or copy when not available); Borrar asks twice.
- Search across meetings (titles, notes and transcripts) on the hub, plain text with accents and case ignored, no model call; results show the meeting and the matching line.

Out of scope: calendar view, categories the wearer defines, sharing audio (Lente keeps none).

Meta models: Muse Spark 1.3 (title and topic, in the existing notes call).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `meeting-memory`: title and topic in the notes; search.
- `companion-app`: meeting cards, detail screen, search, share.

## Impact

- `src/meetings.ts` (schema, prompt, search as a pure function), `src/pilot.ts` (routes), `src/pilot-page.ts` (Reuniones, detail).
