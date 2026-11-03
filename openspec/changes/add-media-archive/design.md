# Design

## Context

### What the clip sends

- **Audio.** The clip streams PCM16 at 16 kHz (256 kbps) to the wearer's runtime. The silence gate drops silence before transcription (`docs/kb/decisions.md`, spend control).
- **Frames.** They arrive as JPEG, on request or in live mode. Each becomes a description in the day record and is then dropped.

### What `add-memory-engine` adds

Segments with ids (`s<day>:<n>`), so each media chunk can be named by the segment it belongs to.

### Arithmetic that sizes the choices (to measure, not results)

| Option | Per hour | Over a day |
|---|---|---|
| Raw PCM16 | 115 MB | about 0.9 GB for 8 h |
| IMA ADPCM (4:1), speech only | about 29 MB | — |
| Opus at 16–24 kbps, speech only | about 7–11 MB | — |
| Keyframes, at most one per 30 s at about 40 KB | — | at most about 38 MB for 8 h; fewer, because only changes are kept |

## Goals / Non-Goals

### Goals

- Play the exact stretch behind a source chip. Target: within 1 s of the tap.
- Show the frame of a minute next to its description.
- Keep storage per recorded hour measured and bounded.
- Keep the battery cost measured.
- Delete on retention, on «Olvidar este día» and on deleting a meeting.
- Never store media for an account whose accepted terms do not describe it, and stop at once when the wearer turns a switch off.

### Non-Goals

- Continuous video.
- Sharing.
- Feeding stored media to models.
- Face blurring (a later change).

## Decisions

### 1. Kept by default, gated by consent

The owner decided on 2026-11-03 that Lente keeps the day as audio, keyframes and text. Consent still gates it, because recording people who are not users is a legal matter.

**The switches.** «Guardar audio» and «Guardar fotos» are per wearer and kept in the profile.
- They are on by default.
- Turning one off stops storage at once.
- Turning it on again keeps media from that moment, not before.

**The hub stores media only when all of these hold:**
- the switch is on;
- the wearer is the owner, or the account has accepted the current terms version and that version describes media (`add-consent`);
- the clip or phone reports the recording-light pattern for media.

**First use.** When an account first starts recording with media on, a one-time explanation is shown, with both switches visible.

**Ahora** shows «Guardando audio · fotos» while active.

### 2. Chunks follow segments

**Cutting.** Audio after the silence gate is buffered per open segment. When the segment closes (`add-memory-engine` decision 4), the chunk is:
- encoded;
- sealed with AAD `media / audio / user / segment id`;
- uploaded with an object key `<user uuid>/<YYYY-MM-DD>/<segment ordinal>.<codec>`, which holds no content and no title.

**The `media_chunks` row** holds only `user_id`, `segment` (ordinal), `kind`, `at`, `ms`, `bytes`, `codec` and `object`. These are plain columns with no content, like the other plain columns in decision 6 of `add-accounts`.

### 3. Codec by measurement

The candidates:

| Codec | Dependency | Cost to measure |
|---|---|---|
| IMA ADPCM | None: pure TypeScript in `src/media-chunks.ts` | Encoder CPU and size |
| Opus through a WASM build of libopus | One runtime dependency | Encoder CPU, size and quality |

**The measures:** encoder CPU per audio hour on the Modal container, bytes per hour, and a listening check by the owner on test speech.

**The rule.** Opus ships only if it at least halves storage at acceptable CPU. Otherwise ADPCM ships. The dependency and its rejected zero-dependency alternative go in `docs/kb/decisions.md`.

### 4. Keyframes on change

A frame that has already been described is kept when all of these hold:
- the description differs from the last kept frame's, by term overlap below a threshold, or a cheap signature moved past a threshold (the JPEG's size and its DC coefficients, which need no full decode);
- at least 30 s have passed since the last kept frame;
- «Guardar fotos» is on.

Kept frames are sealed with AAD `media / frame / user / moment id`, using the moment id the description already has.

### 5. Playback through the hub only

**The route.** `GET /media/<kind>/<id>`:
- It runs behind the user gate.
- It opens the object in the hub and streams it with `Range` support.
- Audio is decoded to WAV on the fly for ADPCM, or served as Ogg Opus.

**What never happens:**
- No signed Storage URL ever reaches a client, because the object is ciphertext and the key stays in the hub.
- Media is never written to logs.

### 6. Retention and deletion

**Retention values.** Media retention is 7, 30 (the default) or 90 days, chosen separately from text retention.

**Nightly expiry** in `src/nightly.ts` deletes expired objects and rows, oldest first, with a cap per run.

**Deletion with content.** «Olvidar este día», deleting a meeting and deleting the account each remove the matching objects before their rows.

**Export.** The account export adds media as files in its archive.

## Risks / Trade-offs

- **Bystanders.** Storing other people's voices and faces raises the stakes, more so with media on by default.
  - Mitigations: the consent gate, the room notice (`add-consent`), a distinct light, a short default retention, no sharing.
  - The policy pages must describe media before it is kept for anyone but the owner.
- **Storage cost** grows with every recorded hour. Measure it per hour, and cap it per account through the spend cap.
- **The Wi-Fi budget for frames competes with audio.** The rate cap and the battery measure decide the default.

## Migration Plan

1. Ship media on for the owner only, and measure storage and battery.
2. Retire the text-only copy and docs in the same group that turns media on (task 4.4).
3. Turn it on for other accounts only after `add-consent` is done and a terms version that describes media is published.
4. Roll back by setting `LENTE_MEDIA=off` on the hub, which stops storage for everyone at once. Expiry removes what was kept.
