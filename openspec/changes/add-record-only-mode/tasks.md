# Tasks

## 1. Hub

- [ ] 1.1 Assist mode in the status and the profile, set with POST routes from the phone, persisted; tests for the profile round trip
- [ ] 1.2 Gate the cue pipeline on the mode (no detection, addressing or reply calls, no cue, buzz or voice in Solo grabar); verify with the eval runner replaying one dialogue in Solo grabar: zero chat calls in its `usage` events, turns still recorded
- [ ] 1.3 Automatic episodes in Solo grabar: split policy (silence gap, maximum length) as a pure function with tests; notes per episode with the meeting extraction; verify on a replayed dialogue that an episode closes and Memoria gains its words

## 2. Phone

- [ ] 2.1 Asistir / Solo grabar switch on Ahora and the "GRABANDO" pill; verify both modes on the phone with the clip
- [ ] 2.2 Recorded time today in Dispositivos (measured from audio received, amber); verify it grows while recording and stops while paused

## 3. Docs

- [ ] 3.1 Privacy table and consent text in `docs/architecture.md` and the introduction mention Solo grabar; README log
