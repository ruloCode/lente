# Proposal

Depends on: `add-home-dock`

## Why

Things happen in Lente while the wearer looks elsewhere: a recording's notes are written, an action waits for approval, memories wait to be reviewed, an agent finishes a job. Today each shows in its own corner (a card on Inicio, a count on Tareas, Memoria, Conexiones) and nothing reaches the wearer when the app is closed. The owner asked for a bell next to Ajustes that shows everything that is happening, and for the whole notification system: the inbox, a history that syncs across devices, alerts on the phone, and the wearer's control over them.

## What Changes

- **The bell.** A round button next to Ajustes on Inicio with the unread count. It opens **Actividad**: everything that happened, grouped by day, newest first, each with what to do about it (open the notes, review the approval, review the memories, see the job). Opening it marks everything read. A filter shows what waits for the wearer.
- **The feed on the hub.** `GET /notifications` derives the feed from what the hub already keeps (meetings and their notes, pending and finished actions, agent jobs, memories to review) over the last 14 days, with the read mark and the wearer's settings. `POST /notifications/read` and `POST /notifications/prefs` save them inside the wearer's sealed profile, so they follow the account to the web and to another phone. A `notifications` event on the stream carries the unread count live. No new table and no stored copies of content.
- **Alerts on the phone.** Android notifications on a «Actividad de Lente» channel, for new items the wearer has not seen, while the app runs (in front or recording in the background) and, when it is closed, from a periodic background check (Android's JobScheduler, every 15 minutes at most often, no new dependency). Tapping one opens Actividad. The first time, the app asks for the notifications permission.
- **Control.** In Ajustes → Notificaciones: alerts on or off; per kind (grabaciones, aprobaciones, recuerdos, agentes); quiet hours; «Durante una reunión, solo lo urgente»; «Ocultar el contenido en la pantalla bloqueada»; and «Vibrar el clip para lo urgente», which the hub applies with the clip's existing cue signal.
- **Not in this change:** Firebase Cloud Messaging for instant delivery with the app closed (a dependency and a Firebase project the owner has to create; designed here, built when the owner sets it up), and Web Push for `/app`.

Out of scope for the hackathon (before 2026-11-04): the release; this is built ahead at the owner's request and stays behind the existing hub until it is deployed.

Meta models: none. Every notification is derived from data Lente already has.

Privacy: the hub stores only a read mark and the settings, sealed in the profile. Notification text is built from the wearer's own data on an authenticated connection; on the lock screen it can be hidden. Logs carry counts, never text.

## Capabilities

### New Capabilities
- `notifications`: the activity feed, its read state and settings on the hub, the bell and Actividad on the phone, system alerts and the clip's buzz.

## Impact

- Hub: new `src/notifications.ts` (feed, unread, settings, quiet hours, buzz rule; pure, tested); `Profile` gains the notification settings in both stores; `src/pilot.ts` gets three routes, the stream event and the buzz.
- Android: `core/Notifications.kt` (feed parsing, grouping, alert rule, local fallback; pure, tested); `ui/Actividad.kt`; the bell on Inicio; `platform/Alerts.kt` (channel, posting, permission) and `platform/ActivityJob.kt` (background check); Ajustes → Notificaciones.
- No new runtime dependency.
