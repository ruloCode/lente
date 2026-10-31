# Design

## Context

The hub serves one phone page (`src/pilot-page.ts`) and speaks a small contract: an SSE stream of JSON events on `GET /events` (the status first, then the day's history, then lists), JSON `POST` routes for every control, and the clip protocol v2 over a WebSocket on `/device` for a phone or desktop standing in for the clip. A laptop hub on the LAN is open; a cloud hub (`LENTE_CLOUD=1`) wants HTTPS and a session cookie from `POST /pair`. The Mac has JDK 17, the Android SDK (platforms 36 and 37, build tools 36) and an arm64 emulator image, so the app can be built and tested on it with no phone attached.

## Goals / Non-Goals

**Goals:**
- Feature parity with the page, natively, against the unchanged hub.
- The phone as a real stand-in device: screen off, in a pocket, all meeting.
- Verified without hardware: unit tests on the JVM and an end-to-end run on the emulator against the stubbed Meta API.

**Non-Goals:**
- A second implementation of hub logic. The app renders what the hub decides; it does not decide what is addressed, what to say or what to remember.
- Offline use without a hub.

## Decisions

1. **Kotlin and Jetpack Compose, not React Native, Flutter or a WebView.** Compose builds with the SDK already on the Mac and Gradle alone, and its UI is native views with no JS bridge. React Native or Expo would add a JS toolchain and a bridge for the parts that matter most (a foreground microphone service, the camera, vibration), and a WebView would inherit the browser's limits this change exists to remove. The architecture's earlier note ("Expo/React Native, post-hackathon") is updated.
2. **Pure core, thin edges, as in the hub.** `app.lente.core` has no Android imports: clip frames, the SSE parser, event decoding, the state reducer, the hub address rules, formatting and contrast. It runs on the JVM with JUnit. Sockets (OkHttp), the service, the camera and Compose stay at the edges.
3. **One reducer for the hub's state.** Every SSE event goes through `HubState.reduce(event)`, which returns the next immutable state; the screens only read it. A reconnect starts from the status and history snapshot the hub sends first, so the reducer replaces rather than appends on `history`.
4. **The same bytes as the clip.** Frames are built by `ClipFrames` and checked against `test/fixtures/frames.json`, the golden frames the hub and the firmware already share. The hello declares `device: "lente-phone"` so the hub treats the app as the phone page.
5. **Record straight at 16 kHz.** `AudioRecord` with `VOICE_COMMUNICATION` (echo cancellation and noise suppression from the platform) at 16 kHz mono PCM16, read in 1280-sample (80 ms) frames: no resampler. The service is a foreground service of type `microphone` (and `camera` while Mirar or En vivo needs it), so it survives the screen turning off.
6. **OkHttp is the one networking dependency.** Android has no WebSocket client; OkHttp gives the WebSocket and a streaming body for SSE. JSON uses `org.json`, which Android ships (the JVM tests add it as a test dependency).
7. **Tokens from the kit, checked like the page's.** The colors are the values of `src/theme.ts`; a unit test computes WCAG contrast for every text pair the app paints, in both themes, and fails under 7:1.
8. **Testable from a script.** The app accepts the hub address as a launch extra and exposes stable test tags, so `scripts/android-e2e.ts` can start the stubbed hub and the clip emulator, launch the app on the emulator, and read the screen with `uiautomator` to see the Dilo card arrive.

## Risks / Trade-offs

- [Plain HTTP on the LAN] → the app allows cleartext only for private addresses and localhost through its network security config; a cloud hub is HTTPS.
- [Two code paths for one UI (page and app)] → both render the same events from the same contract, documented in `docs/kb/hub-api.md`; the hub stays the only place with logic.
- [Disk and build time on the Mac] → one module, no flavors, Gradle's build cache on.

## Open Questions

- Whether the app should find the hub by itself (mDNS) instead of asking for its address; a later change if typing the address proves to be friction.
