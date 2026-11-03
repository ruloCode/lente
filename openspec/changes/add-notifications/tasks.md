# Tasks

Depends on: `add-home-dock`

## 1. The feed on the hub

- [x] 1.1 `src/notifications.ts`: `buildFeed`, `unreadCount`, `parsePrefs`, `isQuiet`, `shouldBuzz`; unit tests over synthetic meetings, actions and facts (`pnpm test`)
- [x] 1.2 `Profile` keeps `notifications` (read mark and settings) in the file and the sealed Supabase store; tests (`pnpm test`)
- [x] 1.3 `GET /notifications`, `POST /notifications/read`, `POST /notifications/prefs`, the `notifications` stream event and the clip buzz; verify against a stubbed hub (`pnpm typecheck && pnpm test`, a throwaway run)

## 2. The bell and Actividad

- [ ] 2.1 `core/Notifications.kt`: feed parsing, grouping by day, the fallback feed from the stream state, `shouldAlert`; unit tests (`./gradlew :app:testDebugUnitTest`)
- [ ] 2.2 The bell on Inicio with the unread count; `ui/Actividad.kt` with groups, actions and the «Por hacer» filter; opening marks read; screenshots on the phone [phone]

## 3. Alerts on the phone

- [ ] 3.1 `platform/Alerts.kt`: the channel, posting once per item with hidden content when asked, the permission; tap opens Actividad; verify a notification on the phone [phone]
- [ ] 3.2 `platform/ActivityJob.kt`: the periodic background check with the saved credentials; verify by closing the app and making an item on a stubbed hub [phone]

## 4. Control

- [ ] 4.1 Ajustes → Notificaciones: alerts, kinds, quiet hours, meetings, hidden content, the clip's buzz; saved through `POST /notifications/prefs` or locally on an old hub; screenshots [phone]
- [ ] 4.2 The owner tries a day with alerts on and adjusts the defaults [human]

## 5. Later

- [ ] 5.1 Firebase Cloud Messaging for instant alerts with the app closed, once the owner creates the Firebase project; the dependency recorded in `docs/kb/decisions.md` [human]
- [ ] 5.2 Web Push for `/app` with VAPID keys
