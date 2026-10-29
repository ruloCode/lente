# Proposal

## Why

Notes describe one meeting; what the wearer needs next month are the durable facts across meetings: who Ana is and what she owns, what the client cares about, which project slipped. Omi (cited in README "Related work") extracts such memories and asks the user to review them. Lente does it the verifiable way: each fact carries the turn that supports it, nothing joins the memory until the wearer keeps it, and kept facts make the replies, the briefing and Preguntar better.

Product pattern only; written fresh, nothing reused.

## What Changes

- The notes extraction also proposes up to five durable facts about people, projects or clients, each in Spanish, at most 120 characters, with the turn that supports it, in the same Muse Spark 1.3 call.
- Proposed facts wait in Memoria under "Por revisar"; the wearer keeps (Guardar) or discards (Descartar) each one, and can open its turn.
- Kept facts join the memory prefix the hub sends with replies, briefings and Preguntar; discarded ones are deleted.
- Memoria lists kept facts with a search field; each can be deleted. Deleting a meeting deletes the facts that only it supports.

Out of scope: editing a fact's text (discard it instead), facts about the wearer's private life outside meetings.

Meta models: Muse Spark 1.3 (in the existing notes call; kept facts in the cached memory prefix).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `meeting-memory`: proposed facts with evidence and the wearer's review.
- `companion-app`: "Por revisar" and kept facts in Memoria.

## Impact

- `src/meetings.ts` (schema, prompt), a facts store under `data/` (git-ignored, text only), `src/briefing.ts` (memory prefix), `src/pilot.ts` (routes), `src/pilot-page.ts` (Memoria).
