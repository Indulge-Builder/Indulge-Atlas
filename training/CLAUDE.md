# Genie Trainer — AI Context (training subfolder)

> **Created**: 2026-07-25
> **What**: A trainee-facing, WhatsApp-styled app that replays **completed Freshdesk tickets** as timed triage drills and scores an intern's path against what the real Genie (concierge agent) actually did.
> **Parent**: see repo-root `CLAUDE.md` for the Atlas platform. This file governs everything under `training/` plus `app/(training)/` and `components/training/`.

---

## The one thing to understand first

**Freshdesk tickets are NOT chat transcripts.** A scan of **55,828 real tickets** (2,216 clients, `exports/` corpus, 2026-07-25) found **~0 member↔agent dialogue**: 70.3% are `[No conversation thread]`, 29.6% are internal-notes-only, and member-inbound bubbles number **exactly 0**. The real WhatsApp dialogue lives in **Chetto**, not Freshdesk.

So this app does **not** replay a Freshdesk conversation (there is nothing to replay). A **Scenario** is built from what a ticket *does* carry:

- **the request** → `subject` + structured `cf_*` custom fields (synthesized into one opening member bubble),
- **the ground truth** → the status timeline (`created → first_responded → resolved/closed`), `priority`, `is_escalated`,
- **never** raw free-text bodies or internal-note content.

This was a deliberate design decision (the user chose the "Freshdesk triage-drill" over a "WhatsApp/Chetto chat replay"). If you are tempted to add real dialogue, that means joining Chetto — a separate, heavier, PII-dense path — not reading Freshdesk conversations.

---

## Hard guarantees (do not regress)

1. **Ingest is read-only.** The only Freshdesk doorway is `training/ingest/freshdeskReadSource.ts`, which re-exports GET helpers from `lib/freshdesk/client.ts` and nothing else. There is **no write path** to production Freshdesk or any member system anywhere in this module. Never add a create/update/reply/delete re-export here.
2. **The store holds no raw PII.** Every string reaching a Scenario passes through the one-way anonymiser (`training/ingest/anonymise.ts`) — destructive replacement, no reversible token map. Free-text member/agent bodies and note bodies are **never ingested** (only structured fields + timestamps).
3. **The clock replays events as offsets from t0** (`training/replay/clock.ts`). Every ground-truth event and every intern action is measured in ms from the ticket's `created_at`. The intern's actions are stamped in the same units the scorer reads.
4. **The report compares the intern's path to the real ticket** (`training/scoring/score.ts`): time-to-first-response, stage accuracy (walked through the concierge state machine), escalation timing, and wrong turns.

---

## Layout

```
training/
  types.ts                     Domain contract (Scenario, GroundTruth, InternAction, AttemptReport). Pure types.
  ingest/
    anonymise.ts               One-way PII scrub (emails/phones/urls/handles/invoice/digit-runs/name/denylist).
    scenarioBuilder.ts         FreshdeskTicket → anonymised Scenario. Pure; node-only (uses node:crypto). Ingest-only.
    freshdeskReadSource.ts     READ-ONLY façade over lib/freshdesk/client (GET only). The single FD doorway.
  replay/
    clock.ts                   Offset math + ReplayClock (playback-speed compression, pause/resume). Pure.
  scoring/
    expectedPath.ts            Legal reference stage path (validated vs the state machine).
    score.ts                   scoreAttempt(scenario, attempt) → AttemptReport. Pure; client- and server-safe.
  ai/
    memberSimulator.ts         AI "member" simulator — pure prompt builder + Anthropic message shaping +
                               guarded JSON parse + deterministic fallback. No network here.
  store/
    scenarios.seed.json        The committed, anonymised store the UI reads. Generated, PII-free.
    loadScenarios.ts           Store reader (schema-version-checked). UI's ONLY data source.
  scripts/
    ingest.ts                  Operator CLI: read-only FD → anonymise → write the store. Real production path.
    build-seed.ts              Canonical synthetic-seed generator (real pipeline via tsx).
    build-seed.mjs             Plain-node mirror of build-seed.ts — used because tsx's ESM loader fails on
                               this repo's OneDrive mount (errno -4094). Keep in lockstep with the TS builder.

app/(training)/train/          UI routes (auth-gated by the shared middleware + layout):
  layout.tsx                   WhatsApp-flavoured shell; getAuthUser gate.
  page.tsx                     Scenario list, grouped by sub-category (falls back to category — see below).
  [scenarioId]/page.tsx        Loads a Scenario → <ScenarioPlayer/>.
app/api/training/
  member-reply/route.ts        POST — the AI member simulator. Auth-gated; loads the scenario server-side;
                               calls Haiku (max_tokens 512, 15s timeout); returns the member's next line.
                               Degrades to a deterministic fallback if Anthropic is unconfigured/fails.
components/training/
  WhatsAppFrame.tsx            Presentational chrome + Bubble.
  ScenarioPlayer.tsx           "use client" — runs the clock, renders chat, offers chips, records the path,
                               scores on finish (scoreAttempt, pure). Each reply POSTs to member-reply so
                               "the member" replies back (typing indicator, timeout/abort + run-id guards).
  ReportCard.tsx               "use client" — renders the AttemptReport.

__tests__/training-*.test.ts   Vitest: anonymise, replay-clock, scoring (root __tests__, @/ alias).
```

---

## Reuse (what this builds on — don't fork it)

- **Freshdesk client**: `lib/freshdesk/client.ts` (extended via the read-only façade, never re-implemented).
- **Ticket→stage engine**: `lib/concierge/ticketStateMachine.ts` — the state machine + `isTransitionAllowed` is the single source of truth for stage legality / "wrong turns".
- **SLA clock**: `lib/concierge/slaClock.ts` — `OVERDUE_THRESHOLD_MINUTES` anchors escalation timing.
- **Status vocabulary**: `CONCIERGE_TICKET_STATUSES` / `CONCIERGE_STATUS_LABELS` / priorities from `lib/types/database.ts`.

---

## Known dependencies & sharp edges

- **Sub-category is ~59% empty upstream** and it is the intended scenario-grouping axis. `loadScenarios.getScenarioGroups()` falls back to category → "Uncategorised" and flags the group `needsBackfill`. Scenarios carry `subcategoryBackfillNeeded`. **Treat sub-category backfill as a data dependency, not polish** — grouping quality is capped until it's filled.
- **The anonymiser can't infer every proper noun.** Regexes catch emails/phones/urls/handles/invoice ids/long digit runs; the requester's name is scrubbed to "the member"; **location/villa/vendor proper nouns need the operator `denylist`** in `scripts/ingest.ts` (the "book the Assagao villa" case). Defence-in-depth: free-text bodies are never ingested, so the exposed surface is only structured `subject`/`cf_*`.
- **Stage granularity is coarse.** Freshdesk records only milestones (created / first response / resolved / closed / escalated), not the intermediate concierge stages. `GroundTruth.expectedPath` is a *legal reference route*, not a transcript. Stage scoring rewards legality + reaching the real final status, never literal path match.
- **Escalation has no timestamp in Freshdesk.** `escalatedOffsetMs` is null; the scorer uses `OVERDUE_THRESHOLD_MINUTES` as the timing reference.
- **OneDrive + tsx**: `npx tsx` / the tsx ESM loader fail here (errno -4094, os error 426). Regenerate the seed with `node training/scripts/build-seed.mjs`; the `.ts` generator is canonical for healthy environments.

## How to

- **Regenerate the demo store**: `node training/scripts/build-seed.mjs` (or `npx tsx training/scripts/build-seed.ts` off OneDrive).
- **Ingest real (read-only) data**: set `FRESHDESK_API_KEY`, then `npx tsx training/scripts/ingest.ts --max-clients 25 --max-scenarios 200` (writes `store/scenarios.seed.json`). Add proper-noun PII to `DENYLIST` first.
- **Bump the schema**: change `TRAINING_SCHEMA_VERSION` in `types.ts`; `loadScenarios` rejects mismatched stores loudly.
- **Sign-off**: `pnpm tsc --noEmit` clean; `pnpm test` for the training suites.
