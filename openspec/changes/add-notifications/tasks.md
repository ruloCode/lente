# Tasks

Depends on: `add-home-dock`

## 1. The feed on the hub

- [x] 1.1 `src/notifications.ts`: `buildFeed`, `unreadCount`, `parsePrefs`, `isQuiet`, `shouldBuzz`; unit tests over synthetic meetings, actions and facts (`pnpm test`)
- [x] 1.2 `Profile` keeps `notifications` (read mark and settings) in the file and the sealed Supabase store; tests (`pnpm test`)
- [x] 1.3 `GET /notifications`, `POST /notifications/read`, `POST /notifications/prefs`, the `notifications` stream event and the clip buzz; verify against a stubbed hub (`pnpm typecheck && pnpm test`, a throwaway run)

## 2. The bell and Actividad

- [x] 2.1 `core/Notifications.kt`: feed parsing, grouping by day, the fallback feed from the stream state, `shouldAlert`; unit tests (`./gradlew :app:testDebugUnitTest`)
- [x] 2.2 The bell on Inicio with the unread count; `ui/Actividad.kt` with groups, actions and the «Por hacer» filter; opening marks read; screenshots on the phone [phone]

Note (2026-11-03, built overnight at the owner's request): on the owner's Samsung against the production hub (still `feat/web-desktop`, so the phone derives the feed itself): the bell showed the unread count, Actividad listed the meetings by day with «Abrir notas», the Notificaciones sheet rendered, and with one item re-armed in the app's preferences a notification was posted on the «Actividad de Lente» channel; launching with its intent opened Actividad. 113 app unit tests and 632 hub tests pass. Found and fixed on the phone: scheduling the job crashed the app without `ACCESS_NETWORK_STATE`; scheduling is now guarded.

## 3. Alerts on the phone

- [x] 3.1 `platform/Alerts.kt`: the channel, posting once per item with hidden content when asked, the permission; tap opens Actividad; verify a notification on the phone [phone]
- [ ] 3.2 `platform/ActivityJob.kt`: the periodic background check with the saved credentials; verify by closing the app and making an item on a stubbed hub [phone]
  - 2026-11-03: the job is scheduled (`dumpsys jobscheduler` lists it); a check with the app closed against a hub that serves the feed is still to run.

## 4. Control

- [ ] 4.1 Ajustes → Notificaciones: alerts, kinds, quiet hours, meetings, hidden content, the clip's buzz; saved through `POST /notifications/prefs` or locally on an old hub; screenshots [phone]
  - 2026-11-03: the sheet renders on the phone with every control; saving through `POST /notifications/prefs` was checked on a stubbed hub, the phone's local save and the clip's buzz on a real clip are still to run.
- [ ] 4.2 The owner tries a day with alerts on and adjusts the defaults [human]

## 5. Later

- [ ] 5.1 Firebase Cloud Messaging for instant alerts with the app closed, once the owner creates the Firebase project; the dependency recorded in `docs/kb/decisions.md` [human]
- [ ] 5.2 Web Push for `/app` with VAPID keys
