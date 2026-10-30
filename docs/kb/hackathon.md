# Meta Global AI Developer Hackathon

Hosted by Meta and Cerebral Valley. Virtual, worldwide. Source: participant guide on the Cerebral Valley platform and the kickoff livestream, 2026-10-26.

## Problem statements (pick one)

- **Build for Your World** (Lente's): bring Meta's models into your own domain; solve a problem you know firsthand, free up time and mental space, make something possible that wasn't before.
- **Push the Frontier:** software, robotics, manufacturing, energy, materials; new machine capabilities, faster experiments, better control of physical systems.

The project **must incorporate Meta's models**: Muse Spark series, Muse Wonder, Muse Image, Muse Voice Transcribe and SAM 3.1 via the Meta Model API; open weights Muse Glimmer and Muse Spark Open; Muse Code as a coding agent.

## Rules

- **Open source:** the repository must be public.
- **Team:** up to 4, all approved participants. Solo allowed (Lente is solo).
- **New work only:** what is presented must have been built during the event, and that must be clear in the submission. Startups may build on existing code but must identify what's new.
- **Demo:** must only highlight features, code and functionality built during the hackathon. If judges can't tell what was built during the event: **immediate disqualification**.
- **Banned:** anything violating legal, ethical or platform policies, or using code, data or assets without rights.

### Anti-projects (generic or disallowed)

Medical advice of any kind (mental health advisors, skin detectors…), basic RAG apps, simple image analyzers, simple "AI for Education" chatbots, job application screeners, nutrition coaches, personality analyzers, sports analyzers or coaches, anything political or about war. At the kickoff they also named plain chat wrappers.

Lente's guardrail: it is a live meeting tool with speaker awareness and multimodal context, not a chatbot. Keep the demo on that.

## Schedule

US Eastern Time switches from EDT to EST on Nov 1. Bogotá is UTC−5 all year.

| Event | ET | Bogotá |
|---|---|---|
| Kickoff livestream | Mon Oct 26, 12:00 PM | 11:00 AM |
| Building period | Oct 27 – Nov 4 | |
| Agents 101: Build a Multimodal AI Agent (Suraj Subramanian) | Tue Oct 27, 12:00–1:00 PM | 11:00 AM |
| Agents 102: Best Practices for Verifiable Agents (Yash Khare) | Wed Oct 28, 12:00–1:00 PM | 11:00 AM |
| Fireworks: Specialized Intelligence with Muse Open Models (Sinan Ozdemir) | Fri Oct 30, 12:00–1:00 PM | 11:00 AM |
| Office hours, text only, `#office-hours` (weekdays) | 10–11 AM | 9 AM until Oct 30 · 10 AM from Nov 2 |
| Last full day for submission questions | Tue Nov 3 | |
| **Submission deadline** (CV platform) | **Wed Nov 4, 9:00 PM** | **9:00 PM** |
| Judging | Nov 5–8 | |
| Closing ceremony: top 10 (5 per track), live final round, winners | Mon Nov 9, 12:00 PM | 12:00 PM |
| Community vote winner (Discord) | Mon Nov 16 | |

## Submission

- One project per team, entered by one "Representative".
- Public repo, accessible **video link**, everyone who worked listed.
- **3-minute demo video** showing only what was built during the hackathon. It is one of the primary artifacts judges use, together with the code and the live product. The kickoff stressed a good voiceover.
- Late submissions are not considered.

## Judging

1. **Stage 1, pass/fail:** fits the theme and reasonably uses the Meta Model API and/or Meta open-weight models.
2. **Stage 2, 0–10 per category:**

| Category | Weight | Question judges ask |
|---|---|---|
| Impact | 30% | Real-world potential? Who benefits and how much? Could people actually use it? Fits a problem statement? |
| Use of Meta AI tooling | 25% | How creative? Beyond a basic integration? Capabilities that surprised them? |
| Technical depth & execution | 20% | Sound engineering, refined, real craft? |
| Demo | 25% | Working, impressive, holds up live? Is the video genuinely cool to watch? |

3. **Stage 3:** top 5 per track; final judges watch the videos live and rank them with the same rubric.

## Prizes

**Indie Developer (USD 400k):** 1st 150k · 2nd 100k · 3rd 75k · 4th 50k · 5th 25k.
Startups (USD 550k): 1st 250k · 2nd 150k · 3rd 75k · 4th 50k · 5th 25k.

**Bonus (USD 50k):**

| Prize | USD | How it's won | Lente's play |
|---|---|---|---|
| Most Viral Project | 20k | Highest engagement on X (likes, reposts, comments) on the demo post until Nov 8 EOD; submit the post link on the platform | Post the demo the night it's submitted |
| Best Build on Meta Open Weight Models | 10k | Built on Muse Glimmer or Muse Spark Open, own hardware or partner inference; partner verifies | Fast layer on Muse Spark Open (Baseten) |
| Community Vote | 10k | Most votes in the public gallery, one per verified account | Share the gallery link |
| Best Agentic Use-Case | 5k | Autonomy, effectiveness, practical usefulness in multi-step work | Post-meeting agent: notes, actions, follow-ups |
| Best Creative Build | 5k | Muse Image or Muse Wonder | Not targeted |

## Credits

| Provider | Amount | How | Notes |
|---|---|---|---|
| Meta Model API | USD 150 | Google form in the guide (section 5); claim by Nov 4, 9 PM ET | Each person claims their own. API calls fail until a credit card is on file (temporary pre-authorization). Set a Spend Limit in Billing. Credits arrive in batches. Billing warns that content sent while on free credits "may be used for product improvement" |
| Baseten | USD 100 + 2M TPM | Request form; up to 2,000 participants, reviewed by use case, email if selected | Key arrives by a one-time link in the email and only works with model `meta-models/muse-spark-open-1026` (the unsuffixed name returns 403 with it). A regular account key works only with the unsuffixed name and is not billed to the credit |
| Modal | USD 100 per team | Request form; up to 1,000 selected teams (the form says it is not first come, first served); needs a Modal workspace first | For open-weight models via Endpoints, GPUs, sandboxes |
| Fireworks | USD 100 per team | Request form; shortlist of teams reviewed with Fireworks; email if selected | Workshop Fri Oct 30 (the guide raised this from USD 25) |

Status (2026-10-28): every key a task needs is in `.env` (`pnpm auto --dry-run` lists them by name): `MODEL_API_KEY` (Meta), `BASETEN_API_KEY` (the hackathon key, carries the USD 100 credit) and `MODAL_TOKEN_ID`/`MODAL_TOKEN_SECRET` (a Modal account token on the Starter plan, which includes USD 30 of compute a month; the hackathon credit is not confirmed). Fireworks has no key and no task needs it. Still to do by hand: each person claims the Meta USD 150 credit by Nov 4, 9 PM ET.

## Community

Discord: `#announcements` (official), `#intros`, `#questions` (Cerebral Valley), `#office-hours` (Meta team), plus partner channels (Baseten, Modal, Fireworks).
