# Submission

The text for the Cerebral Valley form, ready to paste. **Deadline: Wed 2026-11-04, 9:00 PM ET (21:00 Bogotá).** Track: **Indie Developer**. Theme: **Build for Your World**.

Rule for this page: every number is in [docs/benchmarks.md](benchmarks.md) with the script run behind it. Anything not measured is not claimed. Lines marked `TODO(orch)` wait for a link or a feature that lands later today; anything not green by 18:00 is cut, not rushed in.

## Project name

Lente

## One-line description

A clip on any pair of glasses and Meta's models that help you speak in a meeting held in your second language, see if you are blind or have low vision, and remember what was said.

<!-- TODO(orch): if add-practice-mode 5.2 is green, use instead: "A clip on any pair of glasses and Meta's models that help you speak in your second language, see if you are blind or have low vision, practice the piano, and remember all of it." -->

## The problem and the people

- **Professionals who work in their second language.** Millions of engineers, designers and founders work in English every day. In a live meeting the hard part is speed, not vocabulary: someone asks you directly, and by the time you have translated in your head the moment has passed. Lente hears who is speaking, notices when a question is aimed at *you*, and puts one line you can say right now on your phone (the **Dilo** card), with its meaning in Spanish. After the meeting it keeps the notes, the decisions, the tasks and a memory you can ask by text or by voice. The author is one of these people and built it for the meetings he sits in every week.
- **People who are blind or have low vision.** The same camera becomes eyes. **Ver** says, one sentence at a time, what is in front of the person, stays silent when nothing changed, reads text aloud, and answers questions by voice. It never tells them to move or that a path is safe, and never says who someone is. It works with TalkBack.

<!-- TODO(orch): if add-practice-mode 5.2 is green, add a third bullet: - **Learners.** **Practicar** turns the phone on the piano into a patient teacher: the phone hears each note itself, with no audio sent anywhere, marks it right or wrong, and Lente coaches you out loud after each try and remembers how you did. -->

## How each Meta model is used

| Job | Model | How |
|---|---|---|
| Hear the meeting and tell speakers apart | `muse-voice-transcribe-1.0`, `DIARIZATION`, realtime WebSocket | Speaker labels let Lente decide a question was aimed at the wearer and never answer the wearer's own lines |
| Hear the wearer talk to Lente | `muse-voice-transcribe-1.0`, `ENDPOINTING` | The turn is ready about a third of a second after the wearer stops |
| The Dilo line and its Spanish meaning | `muse-spark-1.3`, minimal reasoning, streamed over the Responses API | One sentence in the language of the question plus its meaning in Spanish, in one call |
| What the camera sees | `muse-spark-1.3` with image input | The slide or screen in a meeting; in Ver, one spoken sentence or silence (`=`), and a look that answers the person's own question or reads all the text |
| The voice agent | `muse-spark-1.3` with function calling and `web_search` | Tools over memory, tasks and projects, the camera (`look`), the phone's location, narration on and off, and handing a job to an agent |
| Notes, memory cards, digests | `muse-spark-1.3` with structured output | Every item cites the turn it came from; items without a source are dropped |
| Answers from memory | `muse-spark-1.3`, one streamed call over a local index (words and vectors) | Cites the meeting and the turn, and says «No lo encuentro» instead of guessing |
| Fast lane | Muse Spark Open (`meta-models/muse-spark-open-1026`) on Baseten | Provider routing with fallback and a cool-down |

<!-- TODO(orch): if add-practice-mode lands, add a row: | Piano coaching | `muse-spark-1.3`, one streamed call per attempt | One or two warm, specific sentences from the notes the phone heard | -->

## Measured

All from scripts in the repository, on synthetic speech and synthetic memories, never real meetings ([docs/benchmarks.md](benchmarks.md)).

- **Dilo:** question ends → card on the phone in **3.02 s** p50 (n = 17); "was this question for me?" at **76 %** precision and **81 %** recall (`pnpm eval`, 10 synthetic dialogues).
- **Looking:** Look → description card in **1.26 s** p50, 5 of 5.
- **Talking with Lente:** the turn is ready **323 ms** after you stop; the first sentence of the answer at **3.21 s** p50; **US$ 0.0044** per turn p50.
- **Memory:** **90 of 105** questions answered accurately with the right source, against 17 for the earlier two-call path; **25 of 25** refusals on questions outside the memory or the project; the answer in **3.01 s** p50; the index answers 90 days of all-day recording in **12.2 ms** p95.
- **Recording all day:** **US$ 0.267** per recorded hour with transcription (a 2-hour run).
- **Ver:** the one-sentence live prompt reaches its first token in **3.08 s** p50 against **5.50 s** for the first, checklist prompt, with half the output tokens. With the checklist on the real clip, a description reached the phone **5.33 s** after its frame p50, and a third of the reads stayed silent because nothing had changed.

<!-- TODO(orch): ship-hackathon 6.3 (Ver with the one-sentence prompt on the clip) and add-practice-mode 5.2 (note accuracy, onset → note shown, attempt → coaching line), from docs/benchmarks.md once recorded. -->

## What was built during the hackathon

Everything in the repository was written during the event, from **2026-10-26** to **2026-11-04**, one row per day in the README's [What was built during the hackathon](../README.md#what-was-built-during-the-hackathon). In short:
- the clip: firmware for the Seeed XIAO ESP32-S3 Sense and parametric cases for any glasses;
- the hub in Node and TypeScript with no runtime dependencies, on Modal;
- the Android app in Kotlin and Compose, and the web app;
- realtime transcription with speaker labels, the Dilo line, vision, the voice agent;
- a sealed memory per user with its own search index;
- an MCP server and an agent bridge;
- Ver for people who are blind or have low vision;
- open sign-up for judges, with spend caps, preview terms and a synthetic sample to ask about;
- the project website and a zero-dependency QR code to the APK;
- the evals and benchmarks behind every number.
- the Android release 0.2.0, downloadable from the website.
<!-- TODO(orch): add "Practicar at the piano" if it lands. -->

Prior work, declared: the author once prototyped a meeting copilot in his personal assistant project, on non-Meta models. No code, prompts or assets from it are in this repository.

## Try it

- **Web:** sign in with any Google account at <https://drew-lizcano--lente-hub-hub.us-east.modal.run/app>, open through 2026-11-16. Accept the short preview terms once.
- **Android:** <https://github.com/ruloCode/lente/releases/latest/download/lente.apk>, Android 10 or newer ([release notes](https://github.com/ruloCode/lente/releases/tag/v0.2.0-hackathon)); it opens on «Iniciar sesión con Google».
- No clip needed: the phone is the camera and the microphone. A new account starts with a small synthetic sample («PROBE · Proyecto de ejemplo»), so you can ask «¿Qué se decidió sobre la beta?» in the first minute; «Borrar ejemplo» in Ajustes removes it.
- **Limits:** each account has US$ 1.00 a day of model use and the whole demo US$ 6.00; past a cap Lente says so and you can come back the next day. Audio and photos are never kept for test accounts, only text.

## Links

| Field | Value |
|---|---|
| Repository | <https://github.com/ruloCode/lente> |
| Website | <https://rulocode.github.io/lente/> |
| Video (3 min, public or unlisted, plays without login) | TODO(orch): from the owner at 18:30 |
| Live product | <https://drew-lizcano--lente-hub-hub.us-east.modal.run/app> |
| Android APK | <https://github.com/ruloCode/lente/releases/latest/download/lente.apk> ([v0.2.0-hackathon](https://github.com/ruloCode/lente/releases/tag/v0.2.0-hackathon)) |
| X post | TODO(orch): after the 20:00 post |
| Team | Rulo (solo) |
| Meta models | Muse Voice Transcribe 1.0, Muse Spark 1.3, Muse Spark Open |

## Bonus prizes we claim

- **Most Viral Project:** the X post below, with the 30-second cut of the video.
- **Community Vote:** the gallery link, shared with the post.
- **Best Agentic Use-Case:**
  - **the voice agent:** Muse Spark 1.3 with function calling runs multi-step tool loops over memory, tasks, the camera, the location and the web (first answer sentence at 3.21 s p50);
  - **the agent bridge:** per-user scoped tokens, an MCP server at `/mcp`, and jobs that Claude Code or Codex run on the user's own machine only after the user approves them.
- **Not claimed: Best Build on Meta Open Weight Models.** Muse Spark Open runs in the fast lane with fallback, but it was not measured against Spark 1.3 (one sample only). <!-- TODO(orch): claim it only if add-fast-reply-lane is measured today. -->

## Posts

### X (Spanish)

Under 280 characters with the video attached (a link counts as 23).

> Trabajo en inglés. Cuando me preguntan algo en una reunión, el momento se va mientras traduzco.
>
> Hice Lente: un clip para cualquier gafa que escucha, ve y me da una línea para decir. Con la misma cámara, describe el mundo a quien no ve.
>
> #MetaHackathon rulocode.github.io/lente TODO(orch): video

### X (English)

> I work in my second language. When I'm asked something in a meeting, the moment is gone while I translate.
>
> So I built Lente: a clip for any glasses that gives me one line to say. Its camera also describes the world to those who can't see.
>
> #MetaHackathon rulocode.github.io/lente TODO(orch): video

### LinkedIn (Spanish)

> Durante el Meta Global AI Developer Hackathon construí **Lente**, solo y en diez días: un clip que se pone en cualquier gafa, una app Android y un hub en la nube que usan los modelos de Meta (Muse Voice Transcribe, Muse Spark 1.3 y Muse Spark Open).
>
> - **En reuniones en tu segundo idioma:** Lente sabe quién habla, nota cuándo la pregunta es para ti y te pone en el teléfono una línea para decir, con su significado en español.
> - **Para personas ciegas o con baja visión:** «Ver» dice, una frase a la vez, lo que hay al frente, lee textos y responde por voz. Nunca indica moverse ni dice quién es alguien.
> - **Memoria:** notas, decisiones y tareas que puedes preguntar por texto o por voz, con la fuente.
>
> Cada número que muestro sale de un script en el repositorio. Código abierto: github.com/ruloCode/lente
>
> Pruébalo: rulocode.github.io/lente · App Android: github.com/ruloCode/lente/releases/latest TODO(orch): video

### LinkedIn (English)

> For the Meta Global AI Developer Hackathon I built **Lente**, solo, in ten days: a clip for any pair of glasses, an Android app and a cloud hub on Meta's models (Muse Voice Transcribe, Muse Spark 1.3 and Muse Spark Open).
>
> - **In meetings held in your second language:** Lente knows who is speaking, notices when a question is aimed at you, and puts one line to say on your phone, with its meaning in Spanish.
> - **For people who are blind or have low vision:** «Ver» says, one sentence at a time, what is in front of them, reads text and answers by voice. It never tells them to move or who someone is.
> - **Memory:** notes, decisions and tasks you can ask about by text or by voice, with the source.
>
> Every number I show comes from a script in the repository. Open source: github.com/ruloCode/lente
>
> Try it: rulocode.github.io/lente · Android app: github.com/ruloCode/lente/releases/latest TODO(orch): video

## Gallery blurb

> **Lente** is a clip for any pair of glasses, with an Android app and a hub on Meta's models. In a meeting held in your second language, it notices when a question is aimed at you and gives you one line to say, with its meaning in Spanish. For someone who is blind or has low vision, the same camera says what is in front of them, one sentence at a time, and never tells them to move. Everything it hears and sees becomes a sealed memory you can ask about. Open source, built during the hackathon, every number measured.

<!-- TODO(orch): add the piano sentence if Practicar ships. -->

## Checklist before submitting

- [ ] Repository public; README states the track, the theme, the models and what was built each day
- [ ] The README's «What was built» row for 2026-11-04 complete
- [ ] Video uploaded, public or unlisted, plays without login, shows only what was built during the hackathon
- [ ] The live product works without the author's machine: a second Google account signs in on the web and on Android
- [ ] No API keys, meeting audio, transcripts or photos of real people in the repository or the video
- [ ] Everyone who appears or speaks in the video agreed to it
- [ ] Every number above is in `docs/benchmarks.md`
- [ ] X post link on the form
