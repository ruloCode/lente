# Proposal

Depends on: `add-sight-mode`, `add-practice-mode`, `add-accounts`, `add-web-desktop`, `add-android-app`

## Why

The submission closes on **2026-11-04 at 21:00 Bogotá (21:00 ET)**. Judging runs from Nov 5 to Nov 8, the final round is on Nov 9, and the community vote ends on Nov 16. Judges score:
- Impact, 30%;
- use of Meta's models, 25%;
- technical depth, 20%;
- the demo, 25% (the video and **the live product**).

Today a judge who finds Lente:
- can read the README and watch the video;
- cannot sign in: sign-up is behind an allow list;
- cannot install the app: there is no download page;
- cannot try anything without the clip.

This change turns Lente into something a judge can open, sign into with their own Google account, and use end to end in five minutes:
- talk to it;
- let it see through the phone's camera;
- record a moment and ask about it later;
- practice the piano.

It also packs the last day's work into one plan that several agents can run in parallel while the owner records the video.

## What Changes

- **Judge access: open sign-up with Google, with guardrails** (`LENTE_SIGNUP=open` until 2026-11-17).
  - Any Google account can sign in on the web app (`/app`) and on Android, and gets its own sealed memory in Supabase, as today's accounts do. The allow list stays as the way to close it again.
  - Guardrails:
    - a daily spend cap per user and a global daily cap across all users;
    - the listening capacity cap that exists today, set from a measured number;
    - media (audio and keyframes) stays off for everyone but the owner;
    - a short preview-terms and privacy screen accepted once;
    - deleting your account deletes everything (already built).
  - A new account starts with a small sample: one PROBE project with two synthetic meetings, tasks and a memory. A judge can ask Lente something in the first minute, before recording anything.
- **A project website** on GitHub Pages (`site/`), in Spanish and English:
  - what Lente is and for whom, with the video embedded;
  - «Entrar con Google» to the web app;
  - «Descargar para Android» with a QR code and install steps;
  - how each Meta model is used, the measured numbers, how to build the clip, and what was built during the hackathon;
  - the privacy note.
- **The Android release**: a signed APK published as a GitHub Release asset named `lente.apk`, so the download link stays stable (`releases/latest/download/lente.apk`). It is built on the owner's machine so Google sign-in's registered SHA-1 matches.
- **The rest of the closing work**, as tasks with owners and times:
  - finish and verify Ver's conversation on the phone;
  - the piano demo (`add-practice-mode`);
  - record the measured numbers;
  - the README and the submission text;
  - archive the finished changes;
  - deploy from a clean `main`;
  - submit; post on X and in the gallery.
- **An orchestrator brief** (`docs/handoff-closing.md`): the lanes, the files each one owns, the checkpoints and the gates, so agents can work in parallel without stepping on each other.

## Not in this change

- The full `add-consent` (legal review, room notice, recording light, retention): the preview terms say what Lente is and isn't during judging, and the full change stays for version 1.
- Paid plans (Supabase Pro, Modal beyond today's container); the caps keep the hackathon credits safe instead.
- New hardware.

## Impact

- **Hub:**
  - `src/access-gate.ts` and the sign-up path (open mode);
  - a new pure `src/spend-cap.ts`;
  - `src/terms.ts` (preview terms);
  - a new pure `src/sample-memory.ts` (the PROBE sample);
  - a migration for `accounts.terms_version`/`terms_accepted_at` and `usage_daily`;
  - `deploy/modal/hub.py` (non-secret config, memory size).
- **Android:** the terms screen; «Iniciar sesión con Google» reachable on a fresh install.
- **Web app:** the terms screen.
- **New:** `site/` and `.github/workflows/pages.yml`.
- **Docs:** `README.md`, `docs/submission.md`, `docs/benchmarks.md`, `docs/kb/decisions.md`, `docs/handoff-closing.md`.
