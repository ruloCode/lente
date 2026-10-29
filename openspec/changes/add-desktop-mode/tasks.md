# Tasks

Depends on: `add-phone-capture`

## 1. Capture

- [ ] 1.1 Desktop page with tab/window picker and optional microphone; verify in Chrome with a Meet test call and a YouTube tab [human]
- [ ] 1.2 Audio pipeline to 16 kHz mono PCM frames (resampler as pure code with a unit test on a known sine)
- [ ] 1.3 Scene-change detection on downscaled frames (difference threshold as pure code with tests); verify one picture per slide

## 2. As a clip

- [ ] 2.1 Protocol v2 hello and frames over WebSocket to the hub; verify transcript and cue on the phone with no clip connected [phone]
- [ ] 2.2 Pause, mode and capturing indicator; verify pausing from the phone stops audio from the page [phone]
