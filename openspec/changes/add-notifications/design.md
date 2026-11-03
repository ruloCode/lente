# Design

## Context

See proposal.md for why. The hub already keeps every source: meetings with a status (`running`, `extracting`, `done`, `too-short`, `failed`), actions with a status and, for `run_agent`, an outcome with the job's stage, and facts proposed for review. It already broadcasts meetings and actions on the event stream when they change. The wearer's settings live in `Profile`, sealed in `accounts.display_name_enc` on Supabase and in `data/profile.json` on a laptop.

## Goals / Non-Goals

**Goals:** one feed for everything that happens, the same on every device; alerts that reach the wearer without a new dependency; settings the wearer controls; nothing new stored beyond a timestamp and the settings.

**Non-Goals:** Firebase Cloud Messaging and Web Push (decision 5); notifications about live cues (the DILO card is its own channel); a notification history that outlives its sources.

## Decisions

1. **The feed is derived, not stored.** `buildFeed(sources, now)` turns the current meetings, actions and facts into items, newest first, from the last 14 days, at most 60. Each item has a stable id (`kind:ref`), a group (recordings, approvals, memories, agents), a time, a title and a body in Spanish, the ids it refers to, and whether it is urgent (an approval, a failed job). Memories to review collapse into one item. Alternative rejected: a notifications table, which would copy content, need a migration on the production database, and drift from its sources.
2. **Read state is one timestamp.** `readAt` in the profile; unread is the items after it. Opening Actividad sets it. Alternative rejected: per-item read flags, which need storage per item and bring little for a feed this size.
3. **Settings in the sealed profile.** `notifications: { readAt, prefs }` sits next to the names in the same sealed blob, so it syncs with the account and needs no schema change. `parsePrefs` validates what the phone sends.
4. **Alerts on the phone without a dependency.** The app posts Android notifications itself: from the live stream while it runs (in front, or while the capture service keeps it alive), and from a JobScheduler job every 15 minutes (the platform minimum) that calls `GET /notifications` with the saved credentials when the app is closed. It remembers which ids it already alerted, so nothing alerts twice. The rule `shouldAlert(item, prefs, minuteOfDay, inMeeting)` is pure and mirrors the hub's for the clip.
5. **Firebase and Web Push wait.** Instant delivery with the app closed needs Firebase Cloud Messaging: the `firebase-messaging` dependency, a Firebase project and a service account on the hub (FCM HTTP v1, signed with Node's `crypto`, no hub dependency). It earns its place only when the owner creates the project; until then the background check covers the closed app with a delay of up to 15 minutes. Web Push for `/app` (VAPID, ECDH and AES-GCM with Node's `crypto`) is a later group.
6. **The clip buzzes for what is urgent.** When a new urgent item appears and the wearer turned «Vibrar el clip para lo urgente» on, outside quiet hours, the hub sends the clip its cue signal (`B`). Never during a meeting unless the item is urgent and the wearer allowed it.
7. **Quiet hours wrap midnight.** `from`/`to` in minutes from midnight; `from > to` means across midnight (22:00–07:00).
8. **The old hub.** When `GET /notifications` answers 404 (production before deploy), the phone derives the same feed from the stream state it holds (meetings, actions, facts) with the Kotlin port of `buildFeed`, keeps `readAt` and the settings locally, and still alerts while it runs.

## Risks / Trade-offs

- [The background check runs at most every 15 minutes and Android may defer it] → Said in the settings; Firebase (decision 5) is the fix when the owner sets it up.
- [Notification text on the lock screen] → «Ocultar el contenido» shows «Lente: algo nuevo» only.
- [Two feed builders, TypeScript and Kotlin] → Both are pure with tests over the same cases; the Kotlin one is only the fallback for an old hub.
- [The memory engine work changes `src/pilot.ts` in parallel] → The feed lives in its own module; `pilot.ts` gets only routes and two hooks.
