# Changelog

Notable changes to Indulge Atlas. Newest first.

## 2026-07-25 — Genie Trainer: upload / share + vision

The intern can now share a photo or file with the member.
- **Internal `/train`:** a 📎 Share button + compose bar; images are downscaled
  client-side (≤1024px) and sent to **Haiku vision** so the AI member reacts to
  what was actually shared; files are described by name. A share counts as a reply
  (TTFR) but not a scored action. `memberSimulator.ts` gained an `attachment`
  input + vision message block; the route accepts it with a body-size guard.
  Bytes never persist server-side (data URLs client-side, base64 only in the LLM
  call). Adversarially reviewed (message-alternation with array content, bitmap
  leak, races) and fixed.
- **Public demo** (`genie-trainer.higgsfield.app`): same share UI with a reactive
  (scripted) member acknowledgement — no AI on that host.

## 2026-07-25 — Genie Trainer: AI member simulator

The trainee player now has a live back-and-forth: when a Genie sends a reply, an
AI plays **the member** and replies back.

- **`POST /api/training/member-reply`** (`app/api/training/member-reply/route.ts`) —
  auth-gated; loads the scenario server-side (client sends only its id + the
  conversation, never member data); calls **Haiku** (`claude-haiku-4-5-20251001`,
  `max_tokens` 512, 15s timeout) with the member-simulator system prompt; parses
  guarded JSON. Falls back to a deterministic canned line if Anthropic is
  unconfigured or fails — the drill never breaks.
- **`training/ai/memberSimulator.ts`** — pure: builds the system prompt from the
  Scenario, shapes the Anthropic `messages` (member→assistant, Genie→user, always
  starts `user`), parses/guards the model JSON, and provides the fallback.
- **`components/training/ScenarioPlayer.tsx`** — each reply POSTs and appends the
  member's reply with a typing indicator. Hardened: `AbortController` timeout so a
  stall can't freeze the reply chips, a synchronous double-submit guard, and a
  run-id guard so a Finish/Retry mid-flight can't leak a stray bubble. Member
  replies are chat-only — never counted as scored intern actions.

Env: reuses `ANTHROPIC_API_KEY` (same as Elia). The member is a **fictional**
persona synthesised from the scenario — no real member data, no Freshdesk/member
writes.

## 2026-07-25 — Genie Trainer (trainee replay app)

Added a trainee-facing, WhatsApp-styled training app that replays **completed
Freshdesk tickets** as timed triage drills and scores an intern against what the
real Genie (concierge agent) actually did. Lives under `training/` (+ its own
`CLAUDE.md`), `app/(training)/train/`, and `components/training/`.

**Key finding that shaped the design.** A scan of **55,828 real Freshdesk tickets**
(2,216 clients, `exports/` corpus) found **~0 member↔agent dialogue** — 70.3% are
`[No conversation thread]`, 29.6% are internal-notes-only, member-inbound bubbles
number **exactly 0**. So a "chat replay of the Freshdesk conversation" is not
possible. A **Scenario** is instead built from the request (`subject` + structured
`cf_*` fields, synthesized into one opening bubble), the status timeline
(first-response / resolved / closed / escalated), and priority. The real WhatsApp
dialogue lives in Chetto, not Freshdesk.

**What shipped:**
- **Read-only ingest** (`training/ingest/`): a façade over the existing
  `lib/freshdesk/client.ts` (GET only — no second client, no write path), a pure
  `scenarioBuilder`, and a **one-way anonymiser** run on every string before it
  reaches the store (no raw PII; free-text bodies never ingested).
- **Replay clock** (`training/replay/clock.ts`): every event and every intern
  action is an offset from t0 (`created_at`), with playback-speed compression.
- **Scoring** (`training/scoring/score.ts`): compares the intern's path to the
  ground truth — time-to-first-response, stage accuracy (walked through the
  concierge `ticketStateMachine`), escalation timing, wrong turns → `AttemptReport`.
- **Store** (`training/store/`): a committed, anonymised `scenarios.seed.json`
  read by the UI at runtime; the UI never touches Freshdesk or member tables.
- **UI** (`app/(training)/train/`, `components/training/`): auth-gated,
  WhatsApp-styled list → player (clock + chips) → report card.
- **Tests**: `__tests__/training-{anonymise,replay-clock,scoring}.test.ts`.

**Reused, not rebuilt:** `lib/freshdesk/client.ts`, `lib/concierge/ticketStateMachine.ts`
(stage legality / wrong turns), `lib/concierge/slaClock.ts` (escalation timing),
concierge status vocabulary in `lib/types/database.ts`.

**Known dependency:** Freshdesk **sub-category is ~59% empty** upstream; it is the
scenario-grouping axis. The list falls back to category and flags groups
`needsBackfill`. Treated as a data dependency, not polish.

**Guarantees:** ingest read-only · store holds no raw PII · clock replays as
t0-offsets · report compares intern path to the real ticket · **no write path to
production Freshdesk or any member group.**
