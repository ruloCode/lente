# Tasks

## 1. Hub

- [x] 1.1 Start paused: listening off at boot and a clip connecting doesn't start transcription; update the smoke test to start listening from the phone; `pnpm test` and `pnpm smoke`
- [x] 1.2 Silence gate as a pure module (speech-level threshold from the clip's level, hangover, pre-roll; closed-session reopen with pre-roll first); the hub streams only around speech; unit tests with synthetic levels; `pnpm smoke`
- [x] 1.3 Idle auto-pause as a pure policy (wearer silence, fallback to any speech, meeting exemption, configurable minutes) with fake-clock tests; the hub pauses and the status carries the reason
- [x] 1.4 Usage meter as a pure module: seconds sent and tokens per model per local day, priced from constants that cite `docs/kb/meta-api.md`; `data/usage.json` numbers only; unit tests
- [ ] 1.5 Measure on a synthetic recording with long silences: seconds sent with and without the gate, and how much later the first word of a sentence after silence is transcribed; record both in `docs/benchmarks.md` [key:MODEL_API_KEY]

## 2. Phone

- [ ] 2.1 Start control when paused at boot, the inactivity note with one-tap resume, and "Hoy" in Dispositivos; verify on the phone with the clip against the stubbed Meta API (`pnpm stub`) [hw] [phone]
- [ ] 2.2 README "What was built during the hackathon" row for the day the change lands
