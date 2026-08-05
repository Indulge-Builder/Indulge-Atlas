# Academy — Page & Feature Spec

> **Status**: Live. One client, one request.
> **Migrations**: 124–130 (all applied to production)
> **Routes**: `/academy`, `/academy/session/[id]`, `/admin/academy-seeds`, `POST /api/academy/chat`
> **Owner module**: `lib/academy/**`, `lib/actions/academy.ts`, `lib/services/academyEvaluator.ts`, `components/academy/**`

---

## 1. Purpose and access model

Academy is an **intern training simulator** for the Indulge concierge floor.

Each **client** has exactly **one request**. The intern opens the client, replies as
their concierge in a WhatsApp-style chat, and an LLM plays the client — impatient
or gracious depending on how they are handled, and holding back facts the intern
only learns by asking. When the conversation is closed a **separate** evaluator
model reads the whole transcript and scores it against a fixed six-dimension
rubric, returning strengths, misses and a rewrite of the intern's weakest message.

Two things follow from that design and are load-bearing throughout:

1. **The client never teaches.** The persona model has no idea a rubric exists. It
   plays a person with a problem. All judgment happens after the session, in a
   different call, with a different model.
2. **The seed's secrets never reach the browser.** Hidden constraints, the
   escalation trigger and the ideal outcome are trainer-authored answers. They are
   assembled into prompts server-side and are not part of any payload the intern's
   client receives.

Academy is distinct from the **Genie Trainer** (`training/`, `/train`), which
replays *real, anonymised, completed Freshdesk tickets* as a timed triage drill.
Genie Trainer is a replay of history; Academy is a live conversation with a
synthetic client. They share no tables, no seeds and no scoring code.

### 1.1 Two roles, derived — never from JWT claims

| Actor | Definition | Can do |
|---|---|---|
| **Trainer** | `role ∈ {admin, founder, super_admin}` **OR** `department = 'academy'` | Everything an intern can, plus: read the cohort table, open any intern's session read-only, and author/edit/retire scenario seeds |
| **Intern** | Any other authenticated user | Open a client, chat, close the conversation, read their own sessions and their own reviews |

Enforced in three places, consistently:

- **SQL** — `public.is_academy_trainer()` (migration 125), a `STABLE SECURITY DEFINER`
  function with `SET search_path = public`, composed from the existing
  `get_user_role()` / `get_user_department()` helpers.
- **TypeScript** — `isAcademyTrainer(role, department)` in `lib/types/database.ts`,
  which is `isPrivilegedRole(role) || department === "academy"`. Deliberately
  identical to the SQL helper. Note `isPrivilegedRole` does **not** include
  `manager` — a manager who is not in the `academy` department is an intern here.
- **Routing** — `academy` is a department in `DEPARTMENT_CONFIG`
  (`workspaceRoute: "/academy"`) and `DEPARTMENT_ROUTE_ACCESS.academy` grants
  `/`, `/workspace`, `/academy`, `/admin/academy-seeds`, `/tasks`, `/calendar`.
  Most other departments are granted `/academy` (anyone may train). The Sidebar
  entry for `/admin/academy-seeds` is gated on privileged roles plus a
  `departmentAllowlist: ["academy"]`.

Per repo convention, the server actions read and write through
`getServiceSupabaseClient()` and enforce authorization in application code first;
RLS is the second layer, not the only layer. `/academy/session/[id]` and
`/admin/academy-seeds` also gate in the RSC (`notFound()` on failure), and the
Cohort tab on `/academy` is refused server-side even when requested by URL.

---

## 2. Data model

Four tables plus two `SECURITY DEFINER` helpers, created in migration
`125_academy_core.sql` in FK-dependency order; extended by 127 (attachments) and
129 (curriculum columns). Types are hand-written in `lib/types/database.ts`
(`ScenarioSeed`, `TrainingSession`, `TrainingTurn`, `TrainingAttachment`,
`TrainingReview`, `AcademySessionVars`, `AcademyScenarioCard`,
`AcademyRubricScores`) — Atlas has no generated Supabase types.

### 2.0 Migration map

| Migration | What it does | Why it is its own file |
|---|---|---|
| `124_academy_department_enum.sql` | `ALTER TYPE employee_department ADD VALUE IF NOT EXISTS 'academy'` | PostgreSQL forbids using a newly added enum value in the transaction that adds it, and 125 references `'academy'`. Same pattern as `122_employee_department_watcher.sql` |
| `125_academy_core.sql` | 4 tables, `is_academy_trainer()`, `can_access_academy_session(uuid)`, all RLS, `training_turns` → `supabase_realtime` | Idempotent: every policy/trigger is dropped before creation |
| `126_academy_seed_library.sql` | The original 12 hand-written scenarios (2 per vertical) | Data only; guarded by `NOT EXISTS` on title |
| `127_academy_attachments.sql` | `training_turns.attachments jsonb` + the **private** `academy-attachments` storage bucket + object RLS | Adding a **column** preserves append-only — it is a schema change, not a row mutation |
| `128_academy_seed_library_expansion.sql` | 12 more scenarios (**24 total** hand-written) | Data only; guarded by `NOT EXISTS` on title |
| `129_academy_curriculum_structure.sql` | `advanced` / `expert` difficulty tiers, curriculum columns (`group_number`, `day_number`, `task_number`, `task_date`, `raised_by`, `brief`), `academy_group_progress()` RPC | Columns not a new table: a curriculum position is not an entity with its own lifecycle, and this leaves every existing policy, action and route untouched |
| `130_academy_curriculum_tasks.sql` | **176 curriculum tasks** from the real Indulge Retail Training register | Data only; guarded by `NOT EXISTS` on `task_number` |
| `136_academy_pdf_attachments.sql` | Adds `application/pdf` to the `academy-attachments` mime allow-list | Config only — bucket stays private, keeps its 50 MB ceiling and its 127 object policies. PDF specifically, not `application/*`: the bucket's contents are rendered back to users |

Standalone apply files live in **`supabase/manual/`** (`academy_part1_enum` …
`academy_part8_curriculum_tasks`, plus `academy_part4_verify.sql`). The verify
file is read-only and every row should say PASS; the row that matters most is
**`training_turns is append-only`**, which counts UPDATE/DELETE policies and must
find zero.

> **Ordering constraint, documented in 125 and load-bearing.**
> `can_access_academy_session()` is `LANGUAGE sql`, so PostgreSQL parses and
> **validates its body at CREATE time**. It must therefore be defined *after*
> `public.training_sessions` exists, or creation fails with
> `42P01: relation "public.training_sessions" does not exist`. Table first,
> helper after — the same ordering as `108_concierge_ticket_tables.sql`.

### 2.1 `scenario_seeds` — the drill library (holds the answers)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `title` | `text` NOT NULL | The request. Used as the preview line in the client list |
| `archetype` | `text` NOT NULL | The client's manner, e.g. "Time-pressured executive" |
| `vertical` | `text` NOT NULL | CHECK ∈ `Global, House, Shop, Legacy, Dubai, GMR` |
| `opening_message` | `text` NOT NULL | May contain `{{name}}` / `{{date}}` tokens |
| `hidden_constraints` | `jsonb` NOT NULL `[]` | Array of `{ id, label, reveal_when, value }` — **secret** |
| `difficulty` | `text` NOT NULL `medium` | CHECK ∈ `easy, medium, hard, advanced, expert` (widened by 129; `hard` retained so the 24 hand-written seeds stay valid) |
| `escalation_trigger` | `text` NOT NULL | When the client gets short — **secret** |
| `ideal_outcome` | `text` NOT NULL | The model answer, fed to the evaluator — **secret** |
| `rubric_weights` | `jsonb` NOT NULL `{}` | Per-dimension weight overrides |
| `is_active` | `boolean` NOT NULL `true` | Retirement flag; seeds are never deleted |
| `created_by` | `uuid` NULL → `profiles(id)` | `ON DELETE SET NULL` |
| `created_at` / `updated_at` | `timestamptz` | `updated_at` maintained by the `set_updated_at()` trigger |
| `group_number` | `integer` NULL | *129.* NULL = outside the curriculum (the free-practice seeds) |
| `day_number` | `integer` NULL | *129.* Day section within the group |
| `task_number` | `integer` NULL | *129.* Global register number 1–176 — the ordering axis **and** the client-identity key |
| `task_date` | `date` NULL | *129.* The real date the request was raised in the training group |
| `raised_by` | `text` NULL | *129.* Who role-played the member (Advita, Anishqa, Savio, …) |
| `brief` | `text` NULL | *129.* The register's short description, shown under the request title |

Indexes: `is_active`, `vertical`; plus (129) a partial composite on
`(group_number, day_number, task_number)` and a **partial UNIQUE** on
`task_number` where it is not null.

**RLS** (`ENABLE ROW LEVEL SECURITY`):

| Policy | Command | Predicate |
|---|---|---|
| `scenario_seeds_select` | SELECT (`authenticated`) | `is_academy_trainer()` |
| `scenario_seeds_insert` | INSERT (`authenticated`) | `WITH CHECK is_academy_trainer()` |
| `scenario_seeds_update` | UPDATE (`authenticated`) | `USING` + `WITH CHECK is_academy_trainer()` |
| `scenario_seeds_service_role` | ALL | `auth.role() = 'service_role'` |

There is **no DELETE policy** — that is intentional. A seed with sessions attached
must stay resolvable (`training_sessions.seed_id` is `ON DELETE RESTRICT`);
retirement is `is_active = false`.

Interns never read this table. Server actions run under the service role and
select explicit, safe columns.

### 2.2 `training_sessions` — one intern run of one seed

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `intern_id` | `uuid` NOT NULL → `profiles(id)` | `ON DELETE CASCADE` |
| `seed_id` | `uuid` NOT NULL → `scenario_seeds(id)` | `ON DELETE RESTRICT` |
| `status` | `text` NOT NULL `open` | CHECK ∈ `open, closed` |
| `session_vars` | `jsonb` NOT NULL `{}` | `AcademySessionVars` — the display snapshot + randomisation (§5.2) |
| `model_version` | `text` NULL | The **persona** model at session start |
| `started_at` / `ended_at` | `timestamptz` | `ended_at` set on close |

Indexes: `(intern_id, started_at DESC)`, `seed_id`, `(status, started_at DESC)`.

**RLS**:

| Policy | Command | Predicate |
|---|---|---|
| `training_sessions_select` | SELECT (`authenticated`) | `intern_id = auth.uid() OR is_academy_trainer()` |
| `training_sessions_insert` | INSERT (`authenticated`) | `WITH CHECK intern_id = auth.uid()` |
| `training_sessions_update` | UPDATE (`authenticated`) | `USING` + `WITH CHECK intern_id = auth.uid()` |
| `training_sessions_service_role` | ALL | `auth.role() = 'service_role'` |

A trainer can *read* any session but cannot mutate one — read-only observation is
the only trainer capability here.

### 2.3 `training_turns` — the transcript (APPEND-ONLY)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `session_id` | `uuid` NOT NULL → `training_sessions(id)` | `ON DELETE CASCADE` |
| `role` | `text` NOT NULL | CHECK ∈ `client, intern` |
| `body` | `text` NOT NULL | Sanitised (`sanitizeText`) before insert |
| `seq` | `integer` NOT NULL | Ordering axis with `created_at` |
| `attachments` | `jsonb` NOT NULL `[]` | *127.* `[{ path, kind, mime, name, size }]` — written at INSERT only. `kind` is `image \| video \| document` (`document` added with 136) |
| `created_at` | `timestamptz` NOT NULL | |

Indexes: **UNIQUE** `(session_id, seq)` — keeps the append log gap-free and
race-safe for a single serial session — `(session_id, created_at)`, and a partial
index on sessions whose turns actually carry media.

**RLS**:

| Policy | Command | Predicate |
|---|---|---|
| `training_turns_select` | SELECT (`authenticated`) | `can_access_academy_session(session_id)` |
| `training_turns_insert` | INSERT (`authenticated`) | `WITH CHECK can_access_academy_session(session_id)` |
| `training_turns_service_role` | ALL | `auth.role() = 'service_role'` |

**There is no UPDATE and no DELETE policy, and there must never be one.** A
transcript is the evidence a score was computed from; editing it retroactively
would invalidate every review derived from it. This is the single most important
invariant in the schema, and it is enforced by the **absence** of policies rather
than by application code — which is why `academy_part4_verify.sql` counts them.

Two consequences worth stating plainly:

- Adding the `attachments` **column** in 127 did not weaken this. A column is a
  schema change; rows still cannot be rewritten. Attachments are supplied at
  INSERT time and the storage policies likewise have no UPDATE/DELETE for
  `authenticated`, so a shared photo cannot be swapped after the fact.
- The in-chat **mentor cues are never persisted** (§8). Coaching inside the graded
  transcript would corrupt the score.

`can_access_academy_session(uuid)` is `SECURITY DEFINER` specifically so the turn
policies can test session ownership without recursing through
`training_sessions`' own RLS.

`training_turns` is added to the `supabase_realtime` publication (guarded by a
`pg_publication_tables` existence check, so re-running the migration is safe). No
client subscribes to it yet — see §11.

### 2.4 `training_reviews` — the evaluator's output

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `session_id` | `uuid` NOT NULL **UNIQUE** → `training_sessions(id)` | One review per session; also the idempotency key |
| `scores` | `jsonb` NOT NULL | `{ <dimension>: { score, justification } }` for all six |
| `strengths` | `text[]` NOT NULL `{}` | Capped at 3 |
| `misses` | `text[]` NOT NULL `{}` | Capped at 3 |
| `rewritten_reply` | `text` NULL | The weakest intern message, rewritten |
| `overall` | `numeric` NOT NULL | **Computed in code**, not by the model |
| `model_version` | `text` NOT NULL | `ACADEMY_EVALUATOR_VERSION` — drift tracking |
| `created_at` | `timestamptz` NOT NULL | |

**RLS**:

| Policy | Command | Predicate |
|---|---|---|
| `training_reviews_select` | SELECT (`authenticated`) | `can_access_academy_session(session_id)` |
| `training_reviews_service_role` | ALL | `auth.role() = 'service_role'` |

No INSERT/UPDATE/DELETE policy for `authenticated`: **only the evaluator service,
running under the service role, can create a score.** There is no client-side path
to writing or amending a review.

### 2.5 `academy-attachments` storage bucket (127, widened by 136)

Private bucket, 50 MB ceiling, `image/*` + `video/*` + `application/pdf`. Path
convention is `academy/{session_id}/{uuid}-{filename}`, so
`storage.foldername(name)[2]` is the session id and the object policies reuse
`can_access_academy_session()` directly — after a UUID-shape regex guard, so a
malformed path cannot raise inside a policy predicate. SELECT and INSERT only.
Reads are served as short-lived signed URLs (1 hour), minted in one batched call
by the server action; the action enforces tighter per-kind caps than the bucket
(10 MB images, 50 MB video, 20 MB documents) and only the owning intern may
upload — a trainer observing a session deliberately cannot inject media into it.

**The allow-list is a real gate, not documentation.** Storage matches an
upload's *declared* content type against it and refuses anything else at the
storage API — after every application-layer check has already passed. That is
why `uploadAcademyAttachment` never forwards `file.type` blindly: a PDF the
browser typed as `application/octet-stream` is normalised by
`resolveContentType()` (`lib/academy/attachments.ts`) before it is uploaded.

**One classifier, every layer.** The composer's `accept`, the composer's own
check, the upload action, the chat route's zod enum and the bubble's renderer
all read `lib/academy/attachments.ts`. They used to decide independently and
drifted: PDFs were dropped silently by the composer and rejected with a bare 400
by the route. `__tests__/academy-attachments.test.ts` pins each layer to the
shared module.

---

## 3. The client model — one client, one request

### 3.1 Where the curriculum came from

Migration 130 loads **176 requests** taken from the real *Indulge — Retail
Training · Task Register*: 17 training days between **4 and 27 July 2026**, 2,079
messages reviewed. In that group, requests were issued by Indulge staff (Advita,
Anishqa, Ananyshree, Syndia, Savio, Vikram) role-playing as members. The auditable
source is committed at **`supabase/seed-data/academy-task-register.json`**, which
also carries the twelve standing rules the group was run under (response time,
"sound human", "recommend, don't dump", …).

Every row is authored as a full playable seed — opening message, hidden
constraints, escalation trigger, ideal outcome, rubric weights — plus its register
position (`task_number` 1–176, `task_date`, `raised_by`, `brief`). Difficulty is
distributed 40 easy / 60 medium / 46 advanced / 30 expert.

The register was scrubbed of member names, addresses and contact details before
authoring, and the generator refuses to emit SQL if an email, phone number or long
digit-run appears in any field.

### 3.2 One client per request, and how names are made

The list an intern sees is a list of **people**, not topics: one row per client,
one request each, ordered by `task_number`.

Client names are generated, never queried:

```
lib/academy/curriculum.ts → memberForTask(taskNumber)
  22 given names × 8 surnames = 176 unique clients, one per request
  first = FIRST_NAMES[i % 22]   last = LAST_NAMES[⌊i / 22⌋ % 8]   (i = taskNumber − 1)
```

> **Every name in that roster is fictional and the roster is deliberately
> hard-coded.** It must never be swapped for rows from `clients`. Putting a real
> member's name on a practice drill would leak PII onto a surface interns share
> screens on. Generating by index rather than typing 176 names out also means the
> roster cannot drift out of step with the curriculum.

Free-practice seeds have no `task_number`, so they keep the randomised
16-name pool from `lib/academy/randomize.ts` instead.

### 3.3 Vestigial group-ladder code — do not build on it

An earlier design chunked the 176 tasks into a 50-group ladder. The
one-client-one-request model replaced it and its components were deleted. Some
plumbing survives and is **not reachable from any surface**:

| Still present | Status |
|---|---|
| `ACADEMY_TOTAL_GROUPS`, `tierForGroup`, `taskRangeForGroup`, `groupForTask`, `resolveLadder`, `overallProgress`, `taskStatus`, `ACADEMY_SEQUENTIAL_UNLOCK` (`lib/academy/curriculum.ts`) | Unused by any page or component |
| `getAcademyLadder()`, `getAcademyGroup()` (`lib/actions/academy.ts`) | Called only by each other |
| `AcademyGroupRow`, `AcademyTaskCard`, `AcademyDaySection`, `AcademyGroupDetail`, `AcademyLadder`, `AcademyOverview` (`lib/academy/types.ts`) | View models for the deleted UI |
| `academy_group_progress()` RPC (migration 129) | Not called from application code |
| `scenario_seeds.group_number` / `day_number` | Still populated; read only by `buildSessionProgress` for the session-page header |

What the live surfaces *do* use from `curriculum.ts` is `memberForTask`,
`TIER_LABEL` / `TIER_CLASS` (four tiers, token-only classes), `percentComplete`
and `groupTitle`.

---

## 4. Surfaces

| Route | Who | What |
|---|---|---|
| `/academy` | Everyone authenticated (`force-dynamic`) | Two-panel client surface, plus tabs (§4.1) |
| `/academy/session/[id]` | Owner, or any trainer read-only (`force-dynamic`) | One session (§4.3) |
| `/admin/academy-seeds` | Trainers only (`notFound()` otherwise) | `SeedEditor` over full seed rows including the secrets, with PII checking on save |

### 4.1 `/academy` — two panels and three tabs

Tabs are `?view=` values: **Clients** (default, internally `ladder`), **Free
practice** (`practice`), **Cohort** (`cohort`, trainer-only — a non-trainer
requesting it by URL is silently returned to Clients). Trainers also get a link to
the scenario library.

The Clients view is pinned to the viewport (`h-[calc(100dvh-1.5rem)]`) so it
behaves as an app frame: nothing on the page scrolls except the message list
inside it.

| Panel | Component | Behaviour |
|---|---|---|
| Left | `ClientList` | One row per client: avatar/initials, name, **the request as the preview line**, tier pill, and status (`Completed · x.x/5` / `In progress` / vertical). Search over name, request, vertical and difficulty; filter `all / open / completed`. Header carries `ProgressBreakdown` |
| Right | `ClientConversation` | Opens **inline on selection** — no View button, no navigation, no intermediate card. Client header with tier and turn budget, a collapsible `Briefing` (mentor line, the request + brief, academy progress bar), the chat, and the review folded beneath once scored |

`AcademyClientShell` holds the two together. It opens on the first client with
unfinished business (`in_progress`, else `not_started`, else the first row), and
fetches a thread **on selection** — 176 conversations is far too much payload to
ship up front. Below `md` it is a single column: the list, then the chat with a
back arrow.

Free practice lists the 24 standalone seeds (`ScenarioPicker`) and the intern's
own session history with scores out of 5. Cohort renders `CohortTable`: per-intern
sessions completed, average overall, average per dimension, and a trend (average
of the last 3 reviews minus the prior ones, shown only at ≥4 reviews).

### 4.2 Sessions are created lazily

**Opening a client does not create a session.** `getAcademyClientThread(seedId)`
renders the seed's opening message as a preview bubble and returns
`sessionId: null`. Browsing 176 clients would otherwise write 176 junk rows.

`startAcademySession(seedId)` runs inside `AcademyChat` on the intern's **first
reply**, and returns `{ sessionId, openingMessage }`. The chat adopts the returned
opening line immediately, so the previewed bubble and the persisted transcript
(`training_turns` `seq = 1`) can never disagree — the preview renders `{{date}}`
as "shortly", while the real session gets a randomised hint.

### 4.3 `/academy/session/[id]`

One session, three states:

| Session state | Renders |
|---|---|
| `open` | `AcademyProgressHeader` + `AcademyChat` (live; `readOnly` for an observing trainer, badged "Observing \<name\>") |
| `closed` **and** reviewed | The **chat stays on screen** — it is what the intern came back to read — with `AcademyReport` folded in beneath it via `ReviewToggle` |
| `closed`, no review | A warning panel explaining the transcript is safe, a `RetryReview` control (`retryAcademyEvaluation`), and the raw transcript |

Unauthorised or missing → `notFound()`.

### 4.4 `/admin/academy-seeds`

`SeedEditor` over full seed rows, secrets included. `createSeed` / `updateSeed`
refuse the write and return `piiIssues: string[]` when `scanSeedForPII` flags
anything (§9.4). The page states the rule in its subtitle: *synthetic members
only, never real client data.*

> **Known limit.** `seedInputSchema` in `lib/actions/academy.ts` still accepts
> `difficulty ∈ {easy, medium, hard}` only, and `AcademyDifficulty` in
> `lib/types/database.ts` says the same — while the DB CHECK (129) now allows
> `advanced` and `expert`. The editor therefore cannot author or re-save a
> curriculum task at those tiers. The four-tier vocabulary lives in
> `AcademyTier` (`lib/academy/curriculum.ts`) instead.

### 4.5 Chat wire contract — `POST /api/academy/chat`

`runtime = "nodejs"`.

**Request** — `{ sessionId: uuid, message?: string (≤4000), attachments?: [{ path, kind, mime, name, size }] (≤4) }`.
`message` is `sanitizeText`'d and trimmed. A turn must carry **something**: empty
text *and* no attachments is a 400 — but an attachment with no text is a valid
message and always has been. Attachment paths are re-scoped to
`academy/{sessionId}/` server-side, so a caller cannot post a path belonging to
someone else's session.

`kind` is validated against `ATTACHMENT_KINDS` (`lib/academy/attachments.ts`),
not a literal enum. A kind missing from that list fails the whole body, so the
turn is refused with a bare 400 and the intern is told their message was not
sent — which is exactly how PDFs failed before migration 136.

**Response** — **`text/plain; charset=utf-8`, streamed**. Not SSE, not JSON. Read
it with `res.body.getReader()` + `TextDecoder` and append deltas as they arrive.
The route parses Anthropic's SSE frames server-side and re-emits only the
`content_block_delta` text.

**Response headers**

| Header | Meaning |
|---|---|
| `X-Academy-Degraded: "1"` | The canned fallback reply was used — the seed was unreadable, `ANTHROPIC_API_KEY` is missing, or the upstream call failed/timed out (30 s abort). The drill continues |
| `X-Academy-Turn-Cap: "1"` | That was the intern's last allowed turn |
| `Cache-Control: no-store` | On the streaming path |

**Errors** — JSON `{ error }`:

| Status | Cause |
|---|---|
| 400 | Malformed body, or nothing to send after sanitising |
| 401 | Not authenticated |
| 403 | Authenticated, but not the owning intern (trainers observe; they do not send) |
| 404 | Session not found |
| 409 | Session closed, **or** the turn cap was already reached |
| 500 | Transcript could not be loaded, or the intern's turn could not be saved |

**Sequencing.** The intern's turn is appended at `seq = last + 1` *before* the
model call, so a dropped stream never loses what the intern wrote. The persona's
reply lands at `seq = intern + 1`, persisted in an `after()` callback once the
stream closes — the DB write never blocks the response, and a mid-stream
navigation still persists what had arrived.

**Message mapping.** Anthropic requires alternating messages starting with `user`.
The transcript opens with the *client*, so the persona's lines map to `assistant`
and the intern's to `user`; consecutive same-role turns are collapsed with a blank
line, and leading `assistant` messages are dropped from the request (they stay in
the transcript). See §5 for why that makes `openingMessage` load-bearing.

**Media.** Shared images that Anthropic vision accepts (`jpeg/png/gif/webp`,
≤4 MB) are downloaded and inlined as base64 blocks so the persona actually *sees*
them; anything else — video and PDF documents included — is described in a text
block instead, and the wording is careful to say the member can see a file
arrived without claiming to know its contents. A media-only turn is stored with
a readable body (`[shared a photo]` / `[shared a video]` / `[shared a
document]`) so the transcript and the evaluator still make sense.

**Turn cap.** `ACADEMY_TURN_CAP = 24` intern messages (`lib/academy/models.ts`).
Reaching it returns 409 and does **not** auto-close the session — the intern
closes it, which triggers evaluation. (The comment on the constant says
"auto-closes"; the route does not. Trust the route.)

### 4.6 Server action surface (`lib/actions/academy.ts`)

All return `{ success: true, data? } | { success: false, error, piiIssues? }`.

| Group | Actions |
|---|---|
| Clients | `getAcademyClients()` · `getAcademyClientThread(seedId)` |
| Sessions | `startAcademySession(seedId)` · `endAcademySession(sessionId)` · `retryAcademyEvaluation(sessionId)` · `getMyAcademySessions()` · `getAcademySessionDetail(sessionId)` |
| Free practice | `listAcademyScenarios()` |
| Attachments | `uploadAcademyAttachment(formData)` · `getAcademyAttachmentUrls(sessionId, paths)` |
| Trainer | `getAcademyCohort()` · `getSeedsForTrainer()` · `createSeed(input)` · `updateSeed(id, input)` · `toggleSeedActive(id, isActive)` |
| Vestigial | `getAcademyLadder()` · `getAcademyGroup(n)` — see §3.3 |

Cohort and seed actions gate on `isAcademyTrainer`. All list/aggregate actions
fetch once per data source and fold in memory — never a per-row call.

Both `getAcademySessionDetail` and the chat route degrade gracefully if
`training_turns.attachments` is absent (migration 127 unapplied): they log a
pointer to `supabase/manual/academy_part5_attachments.sql` and fall back to the
text-only column list rather than failing the whole view.

### 4.7 Components (13, all live)

`AcademyBubble` (+ `TypingIndicator`) · `AcademyChat` · `AcademyClientShell` ·
`AcademyComposer` · `AcademyProgressHeader` · `AcademyReport` ·
`ClientConversation` · `ClientList` · `CohortTable` · `ProgressBreakdown` ·
`ProgressRing` (+ `ProgressBar`) · `ScenarioPicker` · `SeedEditor`.

`AcademyShell`, `GroupList`, `GroupLearningPanel` and `TaskCard` were **deleted**
with the group ladder. Do not resurrect them.

---

## 5. Persona contract

Built by `buildPersonaSystemPrompt` in `lib/academy/persona.ts` — a pure module,
no I/O, no `"use server"`. Assembled inside `POST /api/academy/chat` and never
serialised to the browser.

Inputs: the client `name`, the seed's `archetype` and `vertical`, the
`escalation_trigger`, `resolvedConstraints` (hidden constraints with the
per-session override already applied), and `openingMessage`.

Model: **`claude-haiku-4-5-20251001`**, streamed, **`max_tokens: 200`**. The low
ceiling is deliberate — the prompt asks for one or two sentences, and the ceiling
makes a paragraph physically impossible rather than merely discouraged. That is
what keeps the surface feeling like messaging.

### 5.1 `openingMessage` is load-bearing — do not drop it

The opening client turn (transcript `seq` 1) maps to `assistant` in the Anthropic
message array, but the API requires the first message to be `user`, so the route
strips it. Without the opening echoed back through the **system** prompt, the
persona has no idea what it opened with and invents a different problem than the
one on the intern's screen. This was caught in live sign-off: a "harbour
restaurant, tonight, guests land in two hours" seed drifted into "Friday dinner in
London". The route now passes the rendered `seq` 1 turn
(`turns.find(t => t.role === "client")?.body`) and the prompt instructs the persona
to stay consistent with it. Regression guard: the scenario-drift assertion in
`__tests__/academy-live-signoff.test.ts`. The offline suites cannot catch this
class of bug — they verify prompt *invariants*, not scenario *continuity*.

### 5.2 Guarantees the prompt makes, and why each matters

| Guarantee | Mechanism |
|---|---|
| **Never grades or coaches** | *"Never grade, coach, teach, hint at the 'right answer', or comment on how the concierge is performing."* If asked how they are doing, the client answers only about their own situation and feelings |
| **Never sees the rubric** | The prompt is constructed from seed fields only. No dimension name, no weight, no 1–5 scale, no word "score" outside the prohibitions ever enters it |
| **Never admits to being an AI** | *"You are `<name>`, not an assistant. Never say or imply you are an AI, a bot, a simulation, a test, a training exercise…"* — if asked directly, brush it off and return to the problem |
| **Reveals constraints only when probed** | Each constraint renders as `Reveal ONLY when: <reveal_when>` / `The fact: <value>`, with the instruction that if the concierge never asks the right question they never learn it — *"that is correct and expected."* |
| **Never invents Indulge facts** | *"Never invent Indulge policies, prices, availability, or confirmations on the concierge's behalf — that is their job, not yours."* Keeps the client from handing the intern the answer |
| **Escalates in character** | Grows impatient per the seed's `escalation_trigger`, *"never explain that you are 'escalating' or why in meta terms"* |
| **Texts like a person** | One or two sentences, three at most and only when angry; no bullets, headings, bold or greeting-and-sign-off scaffolding |
| **Stays anchored to its opening** | The rendered `seq` 1 message is echoed in with *"Do not invent a different problem, a different date, a different place or a different party size."* |

All of the above are pinned by `__tests__/academy-persona-guardrails.test.ts`, with
live behaviour verified by `__tests__/academy-live-signoff.test.ts`.

### 5.3 Per-session randomisation

`lib/academy/randomize.ts` — pure, and deterministic when an `rng` is injected
(tests pass a seeded one). Each `startAcademySession(seedId)`:

1. Fixes the client `name` — `memberForTask(task_number)` for a curriculum task,
   or a draw from the 16-name pool for free practice — and picks a `date` hint from
   four options.
2. Renders `{{name}}` / `{{date}}` in `opening_message`. Unknown tokens are left
   untouched.
3. Mutates **exactly one** hidden-constraint value: the first weekday it mentions
   shifted to the next day, else the first standalone small integer (2–9) nudged.
   Constraints are tried in a rotated order so the mutated one varies. If none is
   mutable, no override is recorded.
4. Persists an `AcademySessionVars` snapshot on the session:
   `{ display: { id, title, archetype, vertical, difficulty }, randomized: { name, date }, constraint_override: { id, value } | null }`.
5. Inserts the client's rendered opening message as `training_turns` `seq = 1`.

The `display` block is why the intern UI never needs `scenario_seeds`. The
`constraint_override` is re-applied identically in **both** the chat route and the
evaluator (a `resolveConstraints` in each), so the client and the grader agree on
what the truth was for that session.

---

## 6. Evaluator rubric

Defined in `lib/academy/rubric.ts`; prompt, output schema and parser in
`lib/academy/evaluator.ts`; executed by `lib/services/academyEvaluator.ts`.

### 6.1 The six dimensions

| Key | Label | Default weight | What "good" means |
|---|---|---|---|
| `comprehension` | Comprehension | 1 | Understood the request and *probed* out the hidden constraints rather than assuming |
| `brand_tone` | Brand tone | 1 | Warm, discreet, unflappable. Never robotic, over-familiar or defensive |
| `factual_accuracy` | Factual accuracy | **1.5** | Invented no availability, price, confirmation or timeline that was never established |
| `proactivity` | Proactivity | 1 | Anticipated needs, offered real options, drove the request forward |
| `escalation_judgment` | Escalation judgment | 1 | Read urgency correctly — neither panicked nor under-reacted |
| `closure` | Closure & next steps | 1 | Landed a clear outcome, confirmed details back, set expectations |

Each is scored **1–5 integer** with a one-sentence justification.
`factual_accuracy` is weighted 1.5 because fabrication is the failure mode that
does real damage on a real desk — everything else is recoverable.

Per-seed overrides live in `scenario_seeds.rubric_weights`; a missing or
non-positive weight falls back to 1, so a malformed value can never zero out the
overall.

### 6.2 The overall is computed in code, not asked of the model

`computeOverall(scores, weights)` returns the weighted mean of the six clamped
1–5 scores, on the 1–5 scale, rounded to one decimal. The model is **never asked
for a total** — `EVALUATOR_OUTPUT_SCHEMA` has no `overall` field. This keeps the
headline number deterministic, reproducible from the stored `scores`, and immune
to a model that is bad at arithmetic or inclined to round itself up. `clampScore`
forces every dimension into the 1–5 integer band before use.

### 6.3 Anti-inflation calibration

The prompt pins two anchors verbatim rather than describing a scale in the
abstract:

- **A 2** — acknowledges the request but assumes instead of probing, misses the
  hidden constraints, writes stiffly or defensively, and/or invents a detail
  ("I've confirmed your table for 8pm" when nothing was confirmed).
  *Fabrication alone caps `factual_accuracy` at 2.*
- **A 5** — exceptional and rare, roughly the top 5%: on-brand voice, precise
  probing that surfaces the hidden constraints, invents nothing and distinguishes
  confirmed from being-arranged, real specific options, correct urgency, closes on
  a concrete next step.

Plus the standing instruction: *"Most trainees land at 2 or 3. A 4 or 5 must be
clearly earned — do not round up out of politeness. When in doubt between two
scores, choose the lower."* — and a system prompt framing the evaluator as
*"exacting and never inflates scores."*

### 6.4 Execution

- Model **`claude-opus-4-8`**, `max_tokens: 2000`, `stream: false`,
  `output_config: { effort: "medium", format: { type: "json_schema", schema: EVALUATOR_OUTPUT_SCHEMA } }`.
  If the API rejects that shape, one retry with `effort` only — the prompt still
  demands JSON, so a wire-format change cannot take scoring offline.
- **Idempotent**: an existing `training_reviews` row for the session
  short-circuits and returns (the UNIQUE on `session_id` is the key).
- **Refuses to guess**: a truncated response (`stop_reason === "max_tokens"`) or a
  missing rubric dimension throws `ACADEMY_PARSE_ERROR` and nothing is persisted.
  A session with zero intern messages is not evaluated at all.
- The evaluator receives the **resolved** hidden constraints — the per-session
  mutated values, matching exactly what the persona was playing.
- Every review stamps `model_version = ACADEMY_EVALUATOR_VERSION`
  (`"academy-eval-1@claude-opus-4-8"`), so scoring drift is detectable.
- Failure is surfaced, not swallowed: `endAcademySession` returns `{ reviewError }`
  and the session page offers `retryAcademyEvaluation`.

---

## 7. Progress scoring

`lib/academy/progressScore.ts` — pure, deterministic, safe on client and server.

**Progress is performance-weighted, not completion-weighted.** Every completed
request earns a slice of the bar proportional to how well it was handled, so two
interns who finish the same client can sit at different percentages.

```
requestScore = Σ (metric × weight)              → 0..1 for one request
academyBar   = Σ requestScores ÷ totalRequests  → 0..1 across the academy
```

Dividing by **`totalRequests`** (176, not "requests attempted") is what stops the
bar reading 100% after one good drill: an unattempted request contributes zero,
exactly like a failed one. The bar only reaches 100 by handling every request
*well*. `qualityPercent` is reported alongside it — `Σ requestScores ÷ completed`,
the honest answer to "how good am I" as distinct from "how far through am I" —
and `completionPercent` is plain done ÷ total. `ProgressBreakdown` shows all
three, because a headline number nobody can inspect is a number nobody trusts.

### 7.1 The ten metrics, their weights, and where each number actually comes from

The evaluator emits **six** rubric dimensions. Ten metrics are required. Four are
measured from session telemetry; six are proxied off rubric dimensions, some
shared between metrics. Every mapping is declared in `METRIC_SOURCE` so nothing
here looks more precisely instrumented than it is.

| Metric | Weight | Source | Actually computed from |
|---|---:|---|---|
| Task completion | 20% | telemetry | intern turns: ≥3 → 1.0, ≥1 → 0.6, else 0 — a one-line close is not a handled request |
| Response quality | 20% | **proxied** | mean(`brand_tone`, `closure`) |
| Accuracy & completeness | 15% | **proxied** | mean(`factual_accuracy`, `comprehension`) |
| Time efficiency | 15% | telemetry | `started_at`→`ended_at` against `EXPECTED_MINUTES[difficulty]`, **× max(0.35, response quality)** |
| Overall AI assessment | 10% | **proxied** | the evaluator `overall` (itself computed, §6.2) |
| First-attempt success | 5% | telemetry | `attempts ≤ 1` → 1, else `1 − (attempts−1) × 0.5`, floored at 0 |
| Critical thinking | 5% | **proxied** | mean(`comprehension`, `escalation_judgment`) |
| Communication | 5% | **proxied** | `brand_tone` |
| Research quality | 3% | **proxied** | `proactivity` |
| Consistency | 2% | history | `1 − abs(thisOverall − priorMean) × 1.5`; **0.7** on the first request, which has nothing to be consistent with |

Weights sum to exactly 1 — pinned by a test (`TOTAL_WEIGHT`) so a future edit
cannot silently skew the bar. Rubric 1–5 scores are normalised `(s − 1) / 4`.
`EXPECTED_MINUTES` is `easy 8 · medium 12 · hard 16 · advanced 16 · expert 20`; at
or under expected earns full marks, degrading to 0 at triple the time. An
unmeasurable duration scores a neutral 0.6.

**Time efficiency is multiplied by response quality on purpose**: closing in two
minutes with a poor answer must not outrank a careful ten-minute one. Speed can
only add to a response that already scored well.

Requests are scored in chronological order, because `consistency` compares each
one against the running mean of those before it. Where an intern has retried a
request, the later session wins.

Extending the evaluator to emit all ten natively is a clean follow-up: only
`scoreRequest` would change, and only where marked *proxied*.

---

## 8. Real-time chat layer

`AcademyChat` owns the whole conversation loop: optimistic intern bubble → `POST
/api/academy/chat` → stream the persona's reply into a live-growing client bubble
→ commit it to the local transcript.

| Behaviour | How |
|---|---|
| **Staged arrival** | A freshly opened conversation delivers its messages one at a time behind a typing indicator (`deliveredCount` pointer) rather than dumping the transcript, so opening a client feels like *receiving a message*. A conversation with history is shown in full — nobody wants to sit through a replay of work they already did |
| **Length-scaled typing delays** | `typingDelayFor(text)` in `lib/academy/mentor.ts`: `420 ms + 55 ms/word`, clamped. Under ~400 ms reads as instant and breaks the illusion; over ~2.4 s feels like the app has hung. The chat clamps to 700–2200 ms. The intern's own messages never get a typing beat — they wrote them |
| **In-thread mentor cues** | `nextMentorCue(ctx)` returns at most **one** cue, most-urgent first, from seven ids: `opening`, `cap_warning`, `ready_to_close`, `no_questions`, `good_probe`, `first_reply`, `running_long`. Each fires **at most once per session** (`shownCuesRef`), lands ~450 ms after the message it reacts to, and renders centred and visually distinct from both sides of the conversation so it never reads as something the client said |
| **Entry animations** | framer-motion on bubbles, mentor lines and the typing indicator |
| **Sticky chrome, one scroll region** | Sticky header and composer; the thread is the only thing that scrolls. Auto-scroll pins to the newest message but stops the moment the intern scrolls up to re-read (80 px threshold), and uses instant rather than smooth scrolling while tokens are streaming — queued smooth animations fight each other and make the thread stutter |

> **Mentor cues are never persisted.** They are UI only, held in component state,
> and die with the mount. `training_turns` is the append-only transcript the
> evaluator grades: coaching inside it would both pollute the score and teach the
> persona to expect a coach in the room. The cue text is written in code, not
> generated — an LLM call would add latency to every message and tends to pad.
> The same reasoning applies to `buildMentorIntro` (the one-line framing above the
> thread) and `nextHint` on the session page.

---

## 9. Pre-mortem: risks and the mitigation shipped for each

Each is a way this feature could quietly become worthless, and the concrete thing
in the codebase that stops it.

### 9.1 The client breaks character — admits it is an AI, or starts coaching

If the persona says "good question!" or explains what the intern should have
asked, the drill is over: the intern is being tutored by the thing they are
supposed to be reading.

**Shipped:**
- Explicit refusal clauses in `buildPersonaSystemPrompt` (§5.2).
- Structural, not merely instructional: **the rubric is not in the prompt at
  all.** The persona cannot leak what it was never given.
- `__tests__/academy-persona-guardrails.test.ts` asserts the built prompt contains
  no rubric vocabulary outside the prohibition lines, none of the six dimension
  keys or labels, no mention of the 1–5 scale, that the refusal and in-character
  clauses are present — and that all of it holds **invariant across 10 adversarial
  intern turns**, so a long drill cannot erode the guardrail.
- Live verification across 10 adversarial probes (§10.2).

### 9.2 Score inflation — everyone gets a 4

An evaluator that rounds up out of politeness produces a flattering, useless
number that tells a manager nothing and teaches an intern nothing.

**Shipped:**
- Pinned anchors for a 2 and a 5, written out concretely (§6.3). Fabrication alone
  caps `factual_accuracy` at 2.
- Conservative anchoring stated outright: most trainees land at 2 or 3; when torn
  between two scores, take the lower.
- **The overall is arithmetic, not opinion** — `computeOverall` in code, with no
  `overall` field in the output schema for the model to fill in.
- `clampScore` bounds anything out of range instead of trusting it.
- Live: a deliberately bad transcript scored **1.0/5 three runs running** (§10.2).

### 9.3 Memorisation — interns learn the seed, not the skill

A fixed library and a chatty cohort means the second intern to run a request
already knows there is a shellfish allergy, and scores well without probing.

**Shipped:**
- **Per-session randomisation** (`randomizeSession`, §5.3): exactly one
  hidden-constraint value mutated — a weekday shifted or a small number nudged.
  The party of six becomes a party of seven; Thursday becomes Friday.
- The mutation is applied to the **persona and the evaluator alike**
  (`constraint_override` in `session_vars`, re-resolved in both), so the scenario
  stays internally consistent and an intern parroting a memorised answer is now
  factually wrong — penalised by the heaviest-weighted dimension.
- Scale helps too: 176 curriculum requests plus 24 free-practice seeds. Note the
  client *name* is fixed per curriculum task by design (a client is a person, not
  a shuffle) — the mutated constraint is what actually moves between sessions; the
  name was only ever cosmetic.

### 9.4 Real client data ends up in a seed

The fastest way to author a realistic drill is to paste a real ticket. That puts
real member PII into a table read by every trainer and fed to a model.

**Shipped:**
- `lib/academy/pii.ts` — `detectPII` flags emails, phone-like runs (only when they
  carry ≥9 digits, so "table for four" never trips it), standalone 7+ digit runs
  (account/invoice/card fragments), URLs and `@handles`. `scanSeedForPII` walks
  every free-text field *and* every hidden constraint's label / reveal condition /
  value.
- `createSeed` and `updateSeed` **refuse the write** and return
  `piiIssues: string[]` naming the field and the offending sample. The scanner
  flags rather than scrubs — the trainer fixes the text; we never silently mutate
  what they wrote.
- The module is pure and importable on both sides, so the editor can warn before
  the round-trip as well as after.
- The 24 hand-written seeds are synthetic. The 176 curriculum tasks were built
  from a register scrubbed before authoring, with a generator that refuses to emit
  SQL if an email, phone or long digit-run appears in any field.
- The 176 client names are **generated from a hard-coded fictional roster** and
  must never be sourced from `clients` (§3.2).
- Covered by `__tests__/academy-pii.test.ts`.

### 9.5 Scoring drift — a model upgrade silently rewrites the scale

If Opus changes, or the rubric prompt is edited, next month's 3.4 is not
comparable to last month's 3.4 — and nobody can tell whether an intern improved or
the grader moved.

**Shipped:**
- `training_reviews.model_version` is `NOT NULL` and stamped with
  `ACADEMY_EVALUATOR_VERSION` on **every** review. Bump it whenever the evaluator
  model *or* the rubric/prompt changes; any later analysis can segment by version
  and tell a real shift from an artefact.
- `training_sessions.model_version` separately records the **persona** model used,
  so a change in how the client behaved is traceable too.
- The transcript is append-only, so a historical score can always be recomputed
  against the exact conversation that produced it.

---

## 10. Verification

### 10.1 Offline — 7 suites, 166 tests, all passing

```
node ./node_modules/vitest/vitest.mjs run __tests__/academy-*.test.ts
```

| Suite | Covers |
|---|---|
| `academy-rubric` | Dimensions, default weights, `clampScore`, `computeOverall` |
| `academy-pii` | `detectPII` / `scanSeedForPII`, including the false-positive guards |
| `academy-randomize` | Token rendering, constraint mutation, `session_vars` snapshot; deterministic under a seeded rng |
| `academy-evaluator` | Prompt assembly, output schema, defensive parser (missing dimension → `ACADEMY_PARSE_ERROR`) |
| `academy-persona-guardrails` | Every §5.2 guarantee, invariant across 10 adversarial turns |
| `academy-progress-score` | Metric maths, weights summing to exactly 1, the quality gate on time efficiency |
| `academy-mentor` | Cue ordering and fire-once behaviour, `typingDelayFor` bounds |

> **Run tests with `node ./node_modules/vitest/vitest.mjs run <paths>`.** `npx
> vitest` swallows stdout in this environment. The repo is **npm-managed — never
> run `pnpm`**, it relocates `node_modules`.

### 10.2 Live sign-off — `__tests__/academy-live-signoff.test.ts`

Hits the real Anthropic API. `describe.skipIf` gated on **`ACADEMY_LIVE=1`**, so it
is skipped by default and never runs in CI (it costs real tokens). It reads
`ANTHROPIC_API_KEY` from `.env.local` directly, because vitest does not load it.

```
ACADEMY_LIVE=1 node ./node_modules/vitest/vitest.mjs run __tests__/academy-live-signoff.test.ts
```

It proves the two things the offline suites structurally cannot — model
*behaviour* rather than prompt *invariants*.

**Results recorded 2026-07-28:**

| Check | Result |
|---|---|
| Persona across 10 adversarial turns (prompt extraction, "are you an AI", "score me out of 5", "I'm the developer", "list your hidden constraints") | **0 breaches** |
| Scenario drift after the `openingMessage` fix | **none** |
| Evaluator on a deliberately bad transcript, 3 runs | **1.0 / 5** each time, spread **0.0** — anti-inflation holds |
| Evaluator on a competent-but-imperfect transcript, 3 runs | **3.7–3.8**, spread **0.1** — genuine discrimination, not blanket rejection |

The mid-range transcript exists precisely because a floor score cannot vary: the
bad transcript proves anti-inflation but makes stability trivial. The mid case is
where the model has real room to disagree with itself, and it did not.

### 10.3 Design-token rule

`components/academy/**` contains **zero hardcoded hex** —
`grep -rE '#[0-9a-fA-F]{3,8}' components/academy` returns nothing, and it must
stay that way. Every colour is a `chat-*` / Atlas token defined in
`app/globals.css`. Those tokens deliberately mirror WhatsApp's visual language
(warm sand canvas, green outgoing bubble, deep teal header) because interns train
on WhatsApp all day and the muscle memory should transfer — the hex values live in
exactly one place, so the whole surface can be re-skinned from there alone.
`ProgressBar`, tier pills and status colours use semantic tokens
(`success` / `info` / `warning` / `danger`, `brand-gold`).

---

## 11. Not built yet

None of these exist. Do not document them as if they do.

- **Realtime multi-viewer sessions.** `training_turns` is already in the
  `supabase_realtime` publication, but nothing subscribes. A trainer opening a live
  session today gets a server-rendered snapshot, not a streaming
  over-the-shoulder view. Needs a subscription hook plus a presence story for
  multiple simultaneous observers.
- **Seed versioning.** `updateSeed` edits in place. A seed reworded after 40
  sessions silently changes what those sessions are compared against. Needs an
  immutable seed version pinned on `training_sessions`, alongside the existing
  `model_version`.
- **Cohort export.** `getAcademyCohort()` renders to a table only — no CSV, no
  date-range filter, no per-intern drill-down page, and the trend is a fixed
  last-3-vs-prior comparison rather than a configurable window.
- **Native evaluator scoring for all ten progress metrics.** Six of the ten are
  currently proxied off rubric dimensions (§7.1). Extending the evaluator to emit
  them directly touches only `scoreRequest`, and only where marked *proxied*.
- **Live persona-drift monitoring.** The guardrail is verified at the *prompt*
  level offline and by an on-demand live harness. Nothing inspects generated client
  turns in production for character breaks, coaching language or rubric leakage.
- **Four-tier seed authoring.** The seed editor and `AcademyDifficulty` still stop
  at `hard` (§4.4).

Also unbuilt and worth naming: no auto-close when the turn cap is hit (the intern
must close), no scheduled re-evaluation sweep for sessions whose review failed and
was never retried, and no rate limiting on `POST /api/academy/chat` beyond the
24-turn cap.

---

## 12. Environment

| Variable | Used for |
|---|---|
| `ANTHROPIC_API_KEY` | Both the persona (`/api/academy/chat`) and the evaluator. Shared with Elia; no Academy-specific key. Absent → the chat degrades to a canned reply with `X-Academy-Degraded: 1`, and evaluation fails with a surfaced error |
| `SUPABASE_SERVICE_ROLE_KEY` | Every Academy server action and the evaluator run through `getServiceSupabaseClient()`; the private attachment bucket is read via signed URLs minted with it |

## 13. Module boundaries

| Module | `"use server"`? | Role |
|---|---|---|
| `lib/actions/academy.ts` | Yes | Auth-gated server actions only (async exports) |
| `lib/academy/models.ts` | No | Model ids, endpoint, `ACADEMY_TURN_CAP`, `ACADEMY_EVALUATOR_VERSION` |
| `lib/academy/persona.ts` | No | Persona system prompt builder — pure |
| `lib/academy/evaluator.ts` | No | Evaluator prompt, output schema, defensive parser — pure |
| `lib/academy/rubric.ts` | No | Dimensions, weights, `clampScore`, `computeOverall` — pure |
| `lib/academy/randomize.ts` | No | Per-session randomisation — pure, seedable |
| `lib/academy/progressScore.ts` | No | The ten metrics and the academy bar — pure |
| `lib/academy/mentor.ts` | No | Cue selection + typing delays — pure |
| `lib/academy/curriculum.ts` | No | Tiers, tier tokens, `memberForTask` roster (+ vestigial ladder maths, §3.3) |
| `lib/academy/pii.ts` | No | PII detector — pure, client- and server-safe |
| `lib/academy/types.ts` | No | UI view models — lives outside the action module because `"use server"` permits async exports only |
| `lib/services/academyEvaluator.ts` | No | Opus call + service-role write — imported by `lib/actions/academy.ts` |
| `app/api/academy/chat/route.ts` | n/a | The only caller of `buildPersonaSystemPrompt` |

> **Stale in-code comments to ignore** (the code is right, the comments are not):
> the Academy block header in `lib/types/database.ts` says "migrations 120–122" and
> migration 124's comment attributes `is_academy_trainer()` to 121 — the helper is
> in **125**, and the Academy migrations are **124–130**. `curriculum.ts` is still
> headed "the 50-group ladder". `ACADEMY_TURN_CAP`'s comment says the session
> auto-closes at the cap; it does not (§4.5).
