# Proposal

Depends on: `add-accounts`

## Why

Before Lente, the owner kept meetings and memories in hermes-os, his personal assistant, in its own Supabase project. He wants to ask Lente about that history too. Today Lente only knows what it heard itself.

## What Changes

- **A one-way import, run by the owner.** `scripts/import-hermes.ts` reads hermes's `meetings` and `memories` tables with hermes's secret key, maps each row to Lente's model, and writes it into one Lente account, sealed under that account's data key like everything else. It prints counts only.
- **Meetings become Lente meetings.** Each hermes meeting keeps its title, date and length. Its transcript, stored as `Name: text` lines, becomes turns with their speakers, and its summary becomes the meeting's notes. Ids are prefixed `hermes-`, so a second run updates rather than duplicates.
- **Memories become kept facts.** hermes already curated them, so they reach answers without a review step; the owner can still delete any of them in Memoria.
- **Digests for the imported past.** After the rows land, the import writes the day, week and month digests for the imported days. The nightly catch-up does not do this, because it reaches back only 31 days. Ask Lente then plans its lookups over that whole history.

Out of scope: hermes's `conversation_messages` (coding sessions with an agent, not things the owner lived through), other hermes tables, a sync that keeps running, importing for anyone but the owner, and any hermes code or prompt (hard rule 1: the importer is new code that reads hermes's data, not its software).

Meta models: Muse Spark 1.3 writes the backfilled digests, as in `add-accounts` 5.1. Asking stays as in `add-accounts` 5.3.

Privacy: hermes meetings hold other people's words. They stay sealed under the owner's key, never appear in logs or in the repo, and reach Meta only inside the owner's own digests and questions, which he accepted on 2026-11-02. Imported records are marked as coming from hermes so they are never shown as something Lente captured, including in the hackathon video.

## Capabilities

### New Capabilities
- `memory-import`: bringing the owner's earlier history into his Lente account.

## Impact

- New: `scripts/import-hermes.ts`, `src/hermes-import.ts` (pure mapping), tests with synthetic hermes rows.
- Changed: `src/nightly.ts` (`planDigests` takes how far back to reach; the nightly default stays 31 days).
- Env, owner-only: `HERMES_SUPABASE_URL`, `HERMES_SUPABASE_SECRET_KEY` in `.env`; never in the Modal secret.
