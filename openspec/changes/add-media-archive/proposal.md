# Proposal

Depends on: `add-consent` (terms, the room, the recording light, retention), `add-memory-engine` (segments and their ids)

## Why

The wearer wants to record a whole day and later hear and see a moment again, not only read it. Until now Lente promised to keep only text:
- Audio went to transcription and was dropped.
- Camera frames became descriptions and were dropped (`add-accounts` decision 6, `record-only-mode`, `add-memory-timeline`).

**The promise changes (owner's decision, 2026-11-03).** Lente keeps the day as speech audio, keyframes and text (`docs/kb/decisions.md`, "Lente keeps the day as audio, keyframes and text"). What stays from the old promise is how media is handled:
- **Speech only.** Only speech audio is kept, never silence.
- **Changes only.** A camera frame is kept only when the scene changes.
- **Sealed.** Everything is sealed with the wearer's data key.
- **Expiring.** Everything is deleted on a retention the wearer chose.
- **Never shared.** Nothing is shared or sent back to a model.

Each media chunk is aligned with a memory segment. A source chip in the chat or in Revivir can then play the 10–40 s where something was said, and show the frame of that minute.

**The hardware sets the limits.** The XIAO ESP32-S3 Sense sends JPEG frames on request, not video. "Video" here means a timeline of keyframes, not a film.

## What Changes

- **Media is kept by default.**
  - For the owner, from the moment this ships.
  - For any other account, once it has accepted a terms version (`add-consent`) that describes media.
  - «Guardar audio» and «Guardar fotos» in the recording options turn each one off and on again. Both show on Ahora while active, and the clip's recording light uses a distinct pattern while media is kept.
- **Speech audio.**
  - What the silence gate passes is cut at segment boundaries, encoded and sealed per chunk.
  - It is stored in a private Storage bucket under `<user>/<day>/<segment>.<ext>`, with an object key that holds no content.
  - The codec is picked by measurement. IMA ADPCM needs no dependency. Opus through a WASM encoder needs one, which must earn its place.
- **Keyframes.** A frame is kept when the scene changed:
  - the description differs, or a cheap image signature moved past a threshold;
  - at most one per 30 s;
  - sealed like audio.
- **Playback.**
  - «Escuchar» on a source chip and in Revivir streams the chunk, decrypted in the hub, over an authenticated range request.
  - Keyframes show next to the camera line of that minute.
- **Retention.** For media, the wearer picks 7 days, 30 days (the default) or 90 days, separately from the text retention in `add-consent`.
  - Expired chunks are deleted nightly.
  - «Olvidar este día» and deleting a meeting remove its media.
- **Export** includes media. It is the only way media leaves the hub, and it goes only to the wearer.
- **The old promise is retired everywhere it is written.** This covers the README privacy note, the privacy table in `docs/architecture.md`, the phone copy («Lente guarda solo texto, nunca audio») on the web page and in the Android intro and settings, and the `record-only-mode` and `memory-timeline` specs. They change in the same group that turns media on, never before, so no screen claims something that is not yet true.
- **Measured storage and battery.** Storage per recorded hour and the clip's battery cost with frames on are recorded in `docs/benchmarks.md`.

Out of scope for the hackathon (before 2026-11-04 21:00 ET): all of it. The submission keeps describing text-only memory, because that is what it ships.

Also out of scope:
- Continuous video.
- Sharing a clip.
- Face blurring. SAM 3.1 could mask bystanders before storage; that is a later change once it is measured.
- Sending stored media to any model. Models see what they see today, as it happens.

Meta models: none new. Muse Voice Transcribe and Muse Spark 1.3 keep their current roles. Stored media never goes back to a model.

Privacy: this change stores the most sensitive content Lente has, the voices and surroundings of people who are not its users.
- Consent is a legal duty, not a product promise, so `add-consent` gates media for every account but the owner's.
- Media is sealed per chunk, with AAD that binds user, day and segment.
- It expires on a short default.
- It is never shared and never sent to a model.
- The README privacy note and the policy pages (`add-consent`) say so before media is kept for anyone but the owner.

## Capabilities

### New Capabilities
- `media-archive`: sealed, expiring storage of speech audio and scene-change keyframes aligned with memory segments, kept by default once the terms allow it, and playback from sources.

### Modified Capabilities
- `record-only-mode`: Solo grabar keeps speech audio and keyframes alongside the text, instead of text only.

## Impact

- **New pure modules:**
  - `src/media-chunks.ts`: cut at segment boundaries, the codec, the chunk header.
  - `src/keyframes.ts`: the scene-change rule.
- **Edges:**
  - `src/pilot.ts`: tapping the audio after the silence gate, frames after description, playback routes.
  - `src/supabase-stores.ts`: Storage through `fetch`, sealed objects.
  - `src/nightly.ts`: expiry.
- **Database:** a migration for a `media_chunks` index table (ids, times, kinds and sizes only).
- **Clients:** the options sheet and players in `android/` and `/app`.
- **Copy:** «solo texto» lines in `src/pilot-page.ts`, `android/.../ui/Intro.kt` and `android/.../ui/Sections.kt`.
- **Docs:**
  - `docs/kb/decisions.md`: "Lente keeps the day as audio, keyframes and text" (2026-11-03), which supersedes "Solo grabar keeps text only" and `add-accounts` decision 6's "Photos. Never stored".
  - `docs/architecture.md` privacy table, the README privacy note, `docs/benchmarks.md`.
  - The `add-memory-timeline` change: Revivir plays audio and frames when they exist.
