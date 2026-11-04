# Design

## Context

- **Three apps exist, each wired by hand.**
  - Dilo is the meeting pipeline in Asistir: `DIARIZATION` transcription, question detection, the reply cue with its Spanish meaning (`src/briefing.ts`, `src/pilot.ts`).
  - Ver is `assistMode: "sight"`, the live read prompt and the voice session's `persona: "sight"` with `SIGHT_FUNCTIONS` (`look`, `ask_memory`, `add_task`, `remember_person`, `where_am_i`, `quiet_mode`, `narrate`) in `src/voice-agent.ts`.
  - Practicar is the phone's pitch tracker, `GET /practice/lessons`, `POST /practice/attempt` and a coaching line (`src/practice.ts`), with `persona: "piano"` planned.
- **The voice session** (`src/voice-hub.ts`) already picks instructions and a function list per persona (`persona === "sight" ? SIGHT_FUNCTIONS : VOICE_FUNCTIONS`), runs one Muse Spark 1.3 tool loop over the Responses API, and saves chat lines through `save`. That switch is the seam an app runtime replaces.
- **Accounts and storage.** Every account's memory is sealed per user (`src/seal.ts`) in Supabase. Tables have RLS on and no policies: only the hub reaches them with the secret key (`docs/kb/supabase.md`). The owner's local hub keeps the same stores as files in `data/`.
- **Guardrails that already exist**:
  - the per-user and global daily caps, checked before every model call (`src/spend-cap.ts`);
  - media storage owner-only (`mediaAllowed` in `src/media-tap.ts`);
  - preview terms (`src/preview-terms.ts`);
  - Ver's guest session, which keeps nothing for three hours (`setGuest` in `src/pilot.ts`).
- **An earlier decision** (2026-10-28, «MCP is the extension surface») says «No plugin store», and `add-glasses-mcp` notes that MentraOS backed away from cloud-hosted app platforms. Both were about running other people's code. This change keeps that line: an app here is data, and MCP stays the way code reaches Lente.

## Goals / Non-Goals

**Goals:**
- One manifest format that describes the three built-ins truthfully and lets a stranger publish a fourth with no code.
- Every permission and isolation rule enforced in code at two points: what the model is offered, and what the hub runs.
- A trial that is provably sealed (a test shows nothing was written).

**Non-Goals:**
- Letting third-party apps use the meeting pipeline, live reads that listen to the room, the pitch tracker, or any engine.
- Analytics for developers. A developer never sees anything a person did with their app, not even a count, in this change.
- Ranking, search relevance, ratings or reviews by users.

## Decisions

### 1. An app is a manifest the hub interprets; no code runs

The hub reads the manifest and builds a voice session from it: instructions from the persona, the function list from the allow-list and the grants, content items served by a tool. Nothing in the manifest is evaluated.

Rejected:
- **A JavaScript sandbox** (isolated-vm, QuickJS in WebAssembly). It adds a runtime dependency, and an escape on a hub that holds sealed memories and a live camera is the worst failure Lente could have.
- **WebView mini-apps on the phone.** They would need their own permission model next to Android's, and a page can send whatever it reads anywhere.
- **An MCP server per app.** The developer's server would receive the person's words and frames. MCP stays for the person's own agents (`add-agent-bridge`), with scoped tokens the person creates.

### 2. The manifest (`src/app-manifest.ts`, pure)

```json
{
  "manifest": 1,
  "id": "cocina-facil",
  "version": 1,
  "name": "Cocina fácil",
  "icon": "chef",
  "developer": "Ana P.",
  "description": "Mira tu mesón y te dice qué cocinar con lo que tienes.",
  "languages": ["es"],
  "inputs": ["microphone", "camera"],
  "permissions": ["camera", "microphone", "memory.read"],
  "tools": ["look", "ask_memory", "app_note", "app_notes", "app_content"],
  "persona": "Eres un cocinero paciente…",
  "lookPrompt": "Nombra los ingredientes que se ven…",
  "content": [{ "id": "r1", "title": "Arroz con huevo", "text": "…" }],
  "price": { "model": "free" }
}
```

| Field | Rule |
|---|---|
| `manifest` | `1` (the format version) |
| `id` | `^[a-z][a-z0-9-]{2,31}$`, not in `RESERVED_IDS` (`dilo`, `ver`, `practicar`, `idiomas`, `lente`, `apps`, `admin`…) unless built-in |
| `version` | integer ≥ 1, higher than the listed one on update |
| `name` | 2–`APP_NAME_MAX = 32` characters |
| `icon` | a name from Lente's icon set (`web/app/icons.js`, `ui/Icons.kt`); no uploaded images |
| `developer` | 2–40 characters, the name shown; never the account's email |
| `description` | 10–`APP_DESCRIPTION_MAX = 280` characters |
| `languages` | 1–4 of the languages Lente supports today (`es`, `en`; more only when `docs/kb/meta-api.md` documents them, see `add-language-coach`). A built-in may list a language still being checked; the catalog marks it «Pronto» |
| `inputs` | subset of `microphone`, `camera`, `location`; `room` (listening to the people around the wearer) only with an `engine` |
| `permissions` | subset of `camera`, `microphone`, `location`, `memory.read`, `memory.write`; must cover what `inputs` and `tools` need, and nothing they don't (an unused permission is rejected) |
| `tools` | subset of the apps allow-list (decision 4) |
| `persona` | 40–`PERSONA_MAX = 4_000` characters, Spanish or English, checked by `personaProblems()` (decision 5) |
| `lookPrompt` | optional, ≤ 600 characters, requires `look` |
| `content` | ≤ `CONTENT_MAX_ITEMS = 50` items `{ id, title ≤ 80, text ≤ 1_000 }`, ≤ 30,000 characters in all |
| `price` | `{ "model": "free" }` or `{ "model": "trial", "days": 1–30 }` |
| `engine` | built-in only: `dilo`, `ver`, `practicar`, `coach` |

`validateManifest(json, { builtIn })` returns `{ ok: true, manifest }` or `{ ok: false, errors: [{ field, message }] }` with every problem at once, in Spanish for the Publicar screen. Unknown fields are errors, so a later format version is never read half-understood. The limits are named constants, chosen as policy, not measured.

### 3. The built-ins are manifests in the repo

`apps/builtin/dilo.json`, `ver.json`, `practicar.json` and `idiomas.json` (from `add-language-coach`) describe what each does today, with its `engine`. They are validated in a unit test, so a manifest that no longer matches the code fails `pnpm test`:

| App | Engine | Inputs | Permissions | Tools |
|---|---|---|---|---|
| Dilo | `dilo` | room | microphone, memory.read, memory.write | none (the meeting pipeline) |
| Ver | `ver` | microphone, camera, location | camera, microphone, location, memory.read, memory.write | `look`, `ask_memory`, `add_task`, `where_am_i`, `quiet_mode`, `narrate`, `remember_person` |
| Practicar | `practicar` | microphone (on the phone, pitch only) | microphone, memory.write | none yet (`start_lesson`, `last_attempt` when its P1 lands) |

Built-ins are installed for every account and can be hidden, not uninstalled; their behavior does not change in this change. Engines are how built-ins may listen to the room or use native screens; a third-party manifest with `engine` is rejected.

### 4. The apps allow-list and what each tool needs (`src/app-grants.ts`, pure)

| Tool | Needs | Notes |
|---|---|---|
| `look` | camera | the existing look, with the app's `lookPrompt` if set; Ver's movement and face rules always apply |
| `narrate` | camera | live reads with the sight prompt, as in Ver |
| `where_am_i` | location | the phone's approximate address, as in Ver |
| `ask_memory` | memory.read | scoped: never returns other apps' notebooks (decision 6) |
| `list_tasks`, `list_projects` | memory.read | |
| `add_task` | memory.write | the task is marked with the app's id |
| `app_note` | — | writes to the app's own notebook, ≤ 500 characters per note |
| `app_notes` | — | reads the app's own notebook |
| `app_content` | — | reads the manifest's content items by id or title |
| `quiet_mode` | — | |
| `web_search` | — | Spark's built-in search; shown on the app page as «Busca en internet» |

Built-in manifests may also list the tools their engine owns (Ver's `remember_person`, Practicar's `start_lesson`); the validator accepts them only with `builtIn`.

Not available to apps: `delegate` (runs agents), `complete_task`, `delete_task`, `reassign_task` (change the person's data), `start_recording` (recording needs the person's tap and `add-consent`), `remember_person` (Ver's welcome). There is no tool that sends anything to a URL, so nothing an app hears or reads can reach its developer.

`sessionTools({ manifest, grants, trial })` returns the function list the model is offered; `mayCall(name, …)` is checked again when a call arrives, because the model can emit a name it was not given (`docs/kb/meta-api.md`: `strict` only validates schemas). In a trial, `ask_memory`, `list_*`, `add_task` and `app_note` are removed and `app_notes` returns nothing.

Rejected: permissions per tool (eleven switches nobody reads). Five permissions match what Android and browsers already teach people.

### 5. Persona text is data inside Lente's prompt

The instructions for an app session are built in this order:
1. Lente's header: «Eres «Cocina fácil», una app de Lente hecha por Ana P. Hablas con la persona en voz alta…», the date and the person's name;
2. the persona, between fixed delimiters;
3. the content index (titles only; the text comes through `app_content`);
4. Lente's rules, last: never guide movement, never identify faces, no medical, legal or financial advice, confirm before anything destructive, say you are an app of Lente when asked.

`personaProblems(text)` rejects text that imitates the hub's own sections or markup: the delimiters themselves, `MEMORIA (`, `[[`, lines starting with `system:`, `developer:` or `assistant:`, «Reglas que siempre se cumplen», and more than 20 lines in a row in capitals. This is not the security boundary: the boundary is decision 4, in code. It keeps a persona from misleading the model about who is speaking. The full persona is shown on the app's page, so a person can read what the app is told.

The review checklist (decision 9) covers what a validator can't: impersonating a real person or organization, medical or mobility claims, apps aimed at children.

### 6. Notebooks and the memory, isolated by app id

- **Notebook:** a new sealed table `app_notes (user_id, app_id, at, sealed)` (a file per app under `data/apps/` on the local hub). Only `app_note` and `app_notes` touch it, always with the session's app id.
- **What an app adds to the memory** (with `memory.write`) carries `app: <id>`: tasks and day entries gain an optional `app` field.
- **The memory index** (`src/memory-index.ts`) gets a filter: in an app session, `ask_memory` drops units whose `app` is another app's id and never includes `app_notes`. Lente's own voice and chat have no filter and index notebooks as a unit kind `app`, so «¿qué me enseñó la app de cocina?» is answered with sources.
- **Uninstall** deletes the notebook rows and the grants, after a confirmation. Tasks and day entries the app added with `memory.write` stay, because they became the person's.

Rejected: keeping notebooks in the day record. Deleting one app's data would mean rewriting every day it touched.

### 7. «Probar» is a session flag, not the guest switch

`POST /apps/:id/try` returns a one-use ticket; the phone or the web app opens `/voice` with `{"type":"start","app":"<id>","trial":true}`. The session then:
- never calls `save` (no chat lines);
- writes no day entry and no notebook row;
- offers no memory tool (decision 4);
- ends after `TRIAL_MINUTES = 10` with «Se acabó la prueba. Si te gustó, puedes instalarla.».

A developer can try their own draft the same way. A hub test runs a trial on the stubbed Meta API and asserts that the chat store, the day record, the notebook and the memory index are unchanged.

Rejected: flipping Ver's guest switch for the account. It is account-wide, so a trial would also stop a meeting being recorded in another tab.

### 8. Catalog storage (one additive migration)

`supabase/migrations/2026111x_lens_apps.sql`:

| Table | Columns | Notes |
|---|---|---|
| `app_listings` | `app_id`, `version`, `developer_user_id`, `status` (`draft`, `review`, `listed`, `rejected`, `removed`), `manifest jsonb`, `reason`, `created_at`, `reviewed_at` | primary key `(app_id, version)`. Published text is public by intent, so it is not sealed; the developer agrees to that in Publicar |
| `app_installs` | `user_id`, `app_id`, `version`, `grants text[]`, `installed_at`, `trial_ends_at` | primary key `(user_id, app_id)` |
| `app_notes` | `user_id`, `app_id`, `at`, `sealed` | sealed like every memory row |
| `app_reports` | `app_id`, `reporter_user_id`, `reason` (`danino`, `engana`, `permisos`, `no_funciona`, `otro`), `note ≤ 500`, `at` | |

RLS on, no policies, no grants, like the other tables. Account deletion (`src/account-rights.ts`) gains the three per-user tables. Built-ins live in the repo, not in the database.

### 9. Review, reports and takedown

- `POST /apps` stores a draft. «Enviar a revisión» moves it to `review`. A developer may have at most `MAX_PENDING = 5` apps in review.
- The owner's queue (`GET /apps/review`, owner only through `isOwnerId`) shows the manifest, its permissions against its description, the persona in full, and a «Probar» on the draft. `POST /apps/:id/review { decision, reason }`.
- `POST /apps/:id/report { reason, note }` from any account that can see it. Reports go to the owner's queue.
- `POST /apps/:id/takedown { reason }` (owner) sets `removed`. Every running app session checks the listing's status before each turn (one cached read), so a takedown ends it at the next turn.

Rejected: hiding an app automatically after N reports. A few accounts could take down a good app; with one reviewer, a manual queue is enough.

### 10. Routes

| Route | Who | What |
|---|---|---|
| `GET /apps` | signed in | built-ins and listed apps, plus the caller's own drafts |
| `GET /apps/:id` | signed in | the manifest, status, the caller's install and grants |
| `POST /apps/validate` | signed in | `{ ok, errors }`, no write |
| `POST /apps` | signed in, terms accepted | create or update a draft |
| `POST /apps/:id/submit` | developer | draft → review |
| `POST /apps/:id/install` | signed in | `{ grants }`; must be a subset of the manifest's |
| `PATCH /apps/:id/grants` | signed in | revoke or grant |
| `DELETE /apps/:id/install` | signed in | uninstall (deletes the notebook) |
| `POST /apps/:id/try` | signed in | a trial ticket |
| `POST /apps/:id/report` | signed in | |
| `GET /apps/review`, `POST /apps/:id/review`, `POST /apps/:id/takedown` | owner | |

The voice session's `start` gains `app` and `trial`. `parsePhoneMessage` keeps unknown apps out: the hub resolves the id against the person's installs (or the trial ticket) and falls back to the default Lente with a logged reason.

### 11. Surfaces

- **Web** (`web/app/views/apps.js`, routes `/app/apps`, `/app/apps/:id`, `/app/apps/publicar`, `/app/apps/revision`):
  - a grid of apps with icon, name and one line;
  - the app's page: description, developer, languages, each permission with one sentence («Cámara: puede mirar por tus gafas cuando se lo pides»), the persona, «Probar», «Instalar»;
  - Publicar: a textarea or file for the manifest, the validator's errors live as the person types (the same `validateManifest`, shipped to the browser as `web/app/lib/apps.js`; a hub test keeps the two in step);
  - the owner's queue.

  Web «Probar» needs voice in the browser, which the web app does not have; until it does, the web page shows a QR code that opens the trial on the phone.
- **Android (P2):** «Apps» in Ajustes (list, the app's page, grants), and installed apps as choices in the record sheet beside Asistir, Solo grabar, Ver and Practicar. TalkBack descriptions on every control, as in Ver.

### 12. Spend

App sessions call the same model client, so `src/spend-cap.ts` applies unchanged. The usage meter labels each call with the app id (numbers only), so P2 can show «Gasto por app» in Ajustes and the owner can see which app spends the global cap.

## Risks / Trade-offs

- [A persona talks the model into saying something harmful, unprompted by tools] → the rules come last and apply whatever the persona says, a review before listing, reports, and an eval set of hostile personas (task 2.6) run before P1 opens.
- [An app with `memory.read` repeats private memory aloud in a room] → the same risk as Lente's own voice. The permission sentence says so («puede contarte lo que Lente recuerda de ti»).
- [The owner is the only reviewer] → `MAX_PENDING` per developer, and publishing stays owner and allow-list only until `add-consent`.
- [Two copies of the validator (hub and browser)] → one test feeds the same fixtures to both.
- [`trial` without payments is a model with no purpose yet] → it is kept small (a day count). See Open Questions.
- [Latency] → an app session is a voice session. Measured voice turns: 2,150 ms p50 to the first sentence and 3,207 ms p50 to the first answer sentence, US$ 0.0044 per turn (`docs/benchmarks.md`, «Talking with Lente», 2026-11-02). A longer persona adds input tokens; caching the instructions as a `developer` message (as voice mode does) should keep the repeat cost low. Task 2.7 measures it.

## Migration Plan

1. P0 ships with `LENTE_APPS=builtin`: the catalog shows the four built-ins and nothing else; no table is written.
2. Apply the migration (additive; the owner's yes through the Supabase MCP, as before).
3. `LENTE_APPS=open` turns on installs, Publicar and review for the owner and the allow list.
4. Public publishing (any account) only once `add-consent`'s sign-up gate holds.
5. Rollback: `LENTE_APPS=builtin` hides everything third-party at once; the tables can be dropped without touching any other row.

## Open Questions

- What should `trial` mean before payments exist? This design reads it as an install that lasts N days and then stops, keeping the notebook. The owner may prefer `trial` to mean «Probar only, no install yet» for apps in beta. Either answer keeps the specs' shape; the task list follows this design until the owner says otherwise.
