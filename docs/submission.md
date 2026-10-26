# Submission plan

**Deadline:** Wed 2026-11-04, 9:00 PM ET (target: submit on the night of Nov 3).
**Track:** Indie Developer · **Theme:** Build for Your World

## What judges score

| Category | Weight | How Lente earns it |
|---|---|---|
| Impact | 30% | A concrete user (second-language professionals in live meetings) and a concrete moment (being asked something) |
| Use of Meta AI tooling | 25% | Three Meta models with distinct jobs: realtime diarized ASR, open-weights fast layer, multimodal deep layer that reads the screen share |
| Technical depth | 20% | Measured latency budget, real-time pacing, cue prioritization, evals on real meetings |
| Demo | 25% | A real meeting, a real question, the cue on screen in about a second |

Bonus prizes in reach: Best Build on Meta Open Weight Models (Spark Open on Baseten), Most Viral (post the demo on X), Best Agentic Use-Case.

## 3-minute demo video

Voiceover recorded separately, clean audio. Screen at 1080p, cue text large enough to read on a phone.

| Time | Scene | Voiceover (draft) |
|---|---|---|
| 0:00–0:20 | Me in a real English meeting, someone asks me directly, a beat of silence | "I'm a software engineer from Colombia. I work in English every day. This is the moment I lose: someone asks me something, and by the time I've translated it, it's gone." |
| 0:20–0:35 | Title: Lente | "Lente is a copilot for the people who work in their second language." |
| 0:35–1:35 | Live demo: question → cue appears in ~1 s → I say it. Then an unknown acronym → "what it means" card. Then a shared slide → "on screen" card | Narrate each card as it appears; show the latency counter |
| 1:35–2:20 | Architecture: the three Meta models and why each one | "Muse Voice Transcribe tells me who's speaking. Muse Spark Open answers in about a second. Muse Spark 1.3 reads the slide and the whole meeting." |
| 2:20–2:45 | After the meeting: notes, action items, "you were asked 4 times, you spoke 3" | "And afterwards it tells me how I did." |
| 2:45–3:00 | Repo, what was built during the hackathon, close | "Open source, built in ten days on Meta's models." |

## Submission checklist

- [ ] Repository public, README states track, theme, models and what was built during the hackathon
- [ ] "What was built during the hackathon" table complete, one row per day
- [ ] 3-minute video uploaded, link set to public or unlisted, plays without login
- [ ] Demo shows only features built during the hackathon
- [ ] Live product link (if hosted) works without the author's machine
- [ ] Project description: problem, user, how Meta's models are used, impact
- [ ] X post with the demo, link submitted for the Most Viral prize
- [ ] Open-weights bonus flagged (Muse Spark Open on Baseten)
- [ ] No API keys, meeting audio or third-party transcripts in the repo or the video
- [ ] Everyone who appears or speaks in the demo meeting agreed to it

## Fields to fill on the platform

To confirm when the submission form opens: project name, one-line description, track, theme, repo URL, video URL, live demo URL, team members, X post URL, Meta models used.
