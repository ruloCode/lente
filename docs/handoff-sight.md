# Handoff: «Ver», Lente for people who are blind or have low vision

For the coding agent that builds `openspec/changes/add-sight-mode` on 2026-11-04, with the owner's clip and Samsung connected to the Mac. Read `AGENTS.md` first: its hard rules apply. Then read the change's `proposal.md`, `design.md`, `specs/sight-mode/spec.md` and `tasks.md`.

## The goal and the clock

The owner records a use case at the Instituto Nacional para Ciegos (INCI, Bogotá) today, before it closes at 16:00. The hackathon submission closes at 21:00. Groups 1–4 of `tasks.md` must be on the phone by **12:30 Bogotá**. If a group is not done by its time box, stop it, ship what is green, and say so in the final report:

| Group | Time box | Must have |
|---|---|---|
| 1. Measure | 45 min | 1.1 and 1.2: the baseline numbers |
| 2. Hub | 75 min | 2.1, 2.2 (2.3 may slip to after 4.3) |
| 3. Look by voice | 60 min | 3.1, 3.2 |
| 4. Android | 75 min | 4.1, 4.2, 4.3 |
| 5–6 | after the session or in parallel with the owner away | |

## Ground rules

- **Work on `main`** in the main checkout (`/Users/rulocode/dev/side/lente`). The owner asked for everything on `main`. One commit per task group, message `add-sight-mode <n>: …`, after `pnpm typecheck && pnpm test` and `pnpm exec openspec validate add-sight-mode --strict`. Don't push until the owner says so.
- **Never deploy.** Production on Modal runs `main`; the session uses a local hub (`pnpm pilot`) on the Mac with the phone on the same network or over `adb reverse`.
- **Never read or print `.env`**, `~/.config/lente/`, `data/` or `firmware/**/secrets.h`.
- **Model spend:** up to US$ 5 for benches, the eval and real calls, without asking. Each bench prints its cost; keep a running total.
- **Test data is synthetic.** No photo of a person in tests, fixtures, results or commits. The sight eval saves no images. Rendered pages use public text.
- **Every number** in docs comes from 1.2, 3.3, 5.2 or 5.3. The logs' `[live] … ms` lines are not measurements.
- **Untouched:** the cue pipeline in `assist` mode, `record` mode, accounts, the media archive's code paths (only gate them), the firmware (no flashing unless a task needs it; it doesn't).

## The bench

Use the `lente-hardware` skill: it covers the ports, the hub and the phone over adb.

- **Clip:** the XIAO ESP32-S3 Sense with the current firmware (XGA JPEG, `P` for a still, `C`/`c` for camera mode). Find its port with `arduino-cli board list`: the «ESP32 Family Device» row, by exact name. The Samsung is also a `/dev/cu.usbmodem…`; the guard refuses a glob. You should not need to flash.
- **Phone:** the owner's Samsung SM-S931B over adb (`adb devices`, use `-s <serial>`). Install with `pnpm android:apk` then `adb -s <serial> install -r android/app/build/outputs/apk/release/app-release.apk`. Screenshots: `adb -s <serial> exec-out screencap -p > results/sight-<date>/<name>.png` (git-ignored).
- **TalkBack** on and off from adb, for 4.3:
  - on: `adb -s <serial> shell settings put secure enabled_accessibility_services com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService`
  - off: `adb -s <serial> shell settings put secure enabled_accessibility_services ''`

  Samsung may ship TalkBack under `com.samsung.android.accessibility.talkback`; check with `adb shell pm list packages | grep -i talkback`.
- **Hub:** check ports 7070/8080 before starting another (`lsof -i :8080`). `pnpm pilot` prints the phone URL.
- **Test speech:** `say -v Paulina "¿qué tengo en la mano?"` from the Mac's speakers near the phone, for voice questions.
- **Test scenes for 1.2 and 5.2:** the owner leaves on the desk a printed page of public text, a printed «SALIDA» sign, the six banknotes, a cup and keys. Ask the owner if something is missing; don't print anything yourself.

## Where things are

- Live reads: `describeLive`, `onLiveFrame`, `requestLiveFrame`, `setLive`, `LIVE_PROMPT`, `LIVE_FRAME_GAP_MS` in `src/pilot.ts`. «Mirar»: `onScreen` and `ON_SCREEN_PROMPT`.
- Assist mode: `src/profile.ts` (`AssistMode`), `setAssistMode` in `src/pilot.ts`.
- Media gate: `mediaOn` in `src/pilot.ts`, `src/media-tap.ts`, `src/keyframes.ts`.
- Voice: `src/voice-agent.ts` (tool specs near `ask_memory`), `src/voice-tools.ts` (`VoiceBackend`), `src/voice-hub.ts`, wired in `src/pilot.ts` at `serveVoiceSession(ws, …)`.
- Stub: `scripts/stub-meta.ts`; clip emulator: `scripts/fake-clip.ts`; smoke: `scripts/smoke.ts`.
- Android: `android/app/src/main/java/app/lente/` with `ui/Camera.kt` (En vivo, Narrar), `ui/Voice.kt`, `platform/Speech.kt`, `platform/Prefs.kt`, `LenteViewModel.kt`.

## Order inside each group

1. Read the task and the files it names.
2. Write the pure part with its test.
3. Wire it.
4. Run the task's verification.
5. Tick the task, adding a dated sub-bullet with what was checked and the numbers.

## Stop and ask the owner

- The baseline (1.2) shows live reads over 4 s p50: the plan for the video changes, and the owner decides.
- A task needs flashing the clip, a new runtime dependency, or a change to accounts or the database schema.
- TalkBack and the app's voice can't be kept apart within the time box.
- Spend would pass US$ 5.
- The same check fails after two honest attempts.

Asking means ending with the final report, the question on its first line.

## Final report

1. Question for the owner, if any.
2. Done: each group with its commit hash and one line.
3. Measured: each row added to `docs/benchmarks.md`.
4. What the video may show: only what 4.3 checked on the phone and what 5.2 scored well.
5. Spend.
