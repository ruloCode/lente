# Run Lente locally

Back to the [README](../README.md).

You need **Node 22.18 or newer** (`node -v`; TypeScript runs natively, no build step), **pnpm** (`corepack enable`, or `npm i -g pnpm`) and git. Checked on macOS from a fresh clone on 2026-11-04.

### 1. The whole app in one command, no keys and no hardware

```bash
git clone https://github.com/ruloCode/lente.git && cd lente
pnpm install                       # dev tooling only: typescript, @types/node, openspec
pnpm demo                          # then open http://localhost:8080/app
```

`pnpm demo` starts a local hub with a synthetic sample («PROBE · Proyecto de ejemplo»: two meetings, three tasks, kept facts) in its own folder, `data/demo/`. With no `MODEL_API_KEY` it talks to a stubbed Meta API on this machine, so nothing leaves it and every answer is canned. What to try:

- **The Dilo card:** press **Grabar** → **Empezar a grabar** and allow the microphone. The stub hears «Rulo, can we ship the beta on Friday?» whatever you say; it is addressed to you, so within a few seconds the live transcript shows it and a **Dilo** card offers «Yes, Friday works if QA signs off Thursday.»
- **Memory with sources:** ask the chat on the right «¿Qué le prometí a PROBE-Marco?»; the answer comes with a chip that opens the meeting it came from.
- **The rest:** Reuniones, Tareas, Proyectos, Memoria, and **Apps** (Dilo, Ver, Practicar and Idiomas as manifests with their permissions).

`pnpm demo --fresh` starts again from the bare sample. If port 8080 or 7070 is taken: `PILOT_WEB_PORT=8090 PILOT_DEVICE_PORT=7090 pnpm demo`. pnpm may say "Run pnpm approve-builds"; that is the optional local encoder and can be ignored.

### 2. With Meta's models

```bash
cp .env.example .env               # set MODEL_API_KEY from https://dev.meta.ai (optional: BASETEN_API_KEY, ELEVENLABS_API_KEY)
pnpm ping                          # one real call to the Meta Model API
pnpm demo                          # the same sample, now answered by Muse Spark and transcribed for real
pnpm pilot                         # or your own empty memory in data/; open the printed URL
```

The hub prints a `Phone:` address: open it on a phone on the same Wi-Fi, or type it in the Android app (below) and use "Usar el teléfono" when there is no clip.

### 3. The checks

```bash
pnpm typecheck
pnpm test                          # 863 unit tests, node --test
pnpm smoke                         # end to end without keys: clip emulator → hub → stubbed Meta API (≈15 s)
```

### Without installing anything

Sign in with Google on the [hosted hub](https://drew-lizcano--lente-hub-hub.us-east.modal.run/app) or in the [Android app](https://github.com/ruloCode/lente/releases/latest/download/lente.apk); each account starts with the same PROBE sample (see [Status](#status)).

### The Android app and the clip

The Android app needs JDK 17 and the Android SDK (`ANDROID_HOME`); the Gradle wrapper fetches the rest:

```bash
pnpm android:test                  # JVM tests of the app's core (frames, events, state, contrast)
pnpm android:apk                   # shrunk APK in android/app/build/outputs/apk/release/ (≈2.7 MB)
adb install -r android/app/build/outputs/apk/release/app-release.apk
pnpm android:e2e                   # stubbed Meta API → hub → the app on an emulator or phone over adb
```

The clip (a Seeed XIAO ESP32-S3 Sense): copy `firmware/lente-clip/secrets.example.h` to `secrets.h` (git-ignored), set your 2.4 GHz Wi-Fi and the hub's address, then:

```bash
arduino-cli compile -b esp32:esp32:XIAO_ESP32S3:PSRAM=opi --upload -p <port> firmware/lente-clip
```

### Agents (Claude Code, Codex, Cursor)

Lente is an MCP server per user at `<hub>/mcp`, and hands approved work to your coding agents. To set it up:
1. Make an agent token in the app: Ajustes → Cuenta → Dispositivos, **Tipo: Agente**.
2. Connect Claude Code:

   ```bash
   claude mcp add --transport http lente https://<hub>/mcp --header "Authorization: Bearer <token>"
   LENTE_HUB=https://<hub> LENTE_TOKEN=<token> node scripts/lente.ts tasks --who lente --json
   LENTE_TOKEN=<bridge token> node scripts/agent-bridge.ts   # runs jobs you approve in "Por aprobar"
   ```

Cursor and Codex config, the tools, the CLI's exit codes and the bridge's safety rules are in [docs/kb/agents.md](kb/agents.md).
