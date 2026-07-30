# Indulge Atlas

Internal **Company OS** for the Indulge Group: CRM (leads, clients), manager tooling, projects, task intelligence, integrations (Freshdesk, WhatsApp via Chetto), and **Elia** (Anthropic-powered assistant surfaces).

## Stack

| Layer | Choice |
|--------|--------|
| Framework | [Next.js](https://nextjs.org) 16 (App Router) |
| UI | React 19, Tailwind CSS v4, Radix UI, shadcn-style primitives in `components/ui/` |
| Data & auth | [Supabase](https://supabase.com) (PostgreSQL, Auth, Realtime) |
| Language | TypeScript (strict) |

## Prerequisites

- **Node.js** 20+ recommended (aligns with `@types/node` in the repo)
- A **Supabase** project (URL + anon key; service role for server-only scripts and some jobs)

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign-in and dashboard routes live under `app/(auth)/` and `app/(dashboard)/`.

### Environment variables

Copy the template and fill in real values (never commit `.env.local`):

```bash
cp .env.example .env.local
```

At minimum these three are **required** — `proxy.ts` returns a 503 "Server
configuration error" if the two `NEXT_PUBLIC_` Supabase vars are missing:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; bypasses RLS where used |

See `.env.example` for the full, documented list.

Other variables are **feature-specific** (omit what you do not use locally), for example:

- **Elia** — `ANTHROPIC_API_KEY`
- **Chetto (WhatsApp)** — `CHETTO_API_KEY`
- **Freshdesk** — `FRESHDESK_API_KEY` (via server actions)
- **Webhooks / rate limits** — `PABBLY_WEBHOOK_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- **Sentry, Meta ads, internal routes** — see codebase / deployment config

### Supabase schema

SQL migrations live in `supabase/migrations/`. Apply them with the Supabase CLI against your project before expecting full app behaviour.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server (webpack — reliable on OneDrive-synced checkouts) |
| `npm run dev:webpack` | Alias for the webpack dev server |
| `npm run dev:turbo` | Dev server using Turbopack (faster; use only outside OneDrive — see note below) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm test` | Vitest |

`npm run types:generate` is a placeholder for generating DB types into `lib/types/database.generated.ts` (the app currently relies on hand-maintained types in `lib/types/database.ts`).

## Local dev on OneDrive (Windows) — Turbopack cache crash

This repo lives under `OneDrive\Desktop\atlas`. OneDrive continuously syncs the
`.next/` build cache, which locks files while Turbopack is writing its persistent
cache DB and produces:

```text
Error: Failed to open database
Caused by: The cloud operation was not completed before the time-out period expired. (os error 426)
```

Mitigations (in order of preference):

1. **Use `npm run dev`** — it now defaults to `--webpack`, which does not hit the
   Turbopack persistent-cache DB and starts reliably here (~4s). `npm run dev:turbo`
   remains available for machines outside OneDrive.
2. **Clear a corrupted cache** if a start hangs or the lock sticks:

   ```powershell
   Remove-Item -Recurse -Force .next
   ```

   (also kill stray `node` processes if you see `Unable to acquire lock at .next\dev\lock`).
3. **Exclude `.next` from OneDrive** (optional, best long-term): right-click the
   `.next` folder → *OneDrive* → *Always keep on this device* off / *Free up space*,
   or move the checkout outside the OneDrive-synced tree entirely.

`.next/` is already git-ignored; none of this affects production/Vercel builds.

## Project layout (high level)

- `app/` — routes, layouts, API routes (`app/api/`)
- `components/` — feature UI (`leads/`, `clients/`, `manager/`, `projects/`, `elia/`, etc.) and shared `components/ui/`
- `lib/actions/` — Server Actions (`"use server"`) and server-only modules used from routes
- `lib/supabase/` — browser client, server client, service client
- `supabase/migrations/` — Postgres migrations

## Contributor docs

- **`CLAUDE.md`** — concise map, conventions, and “how to” notes for AI and humans
- **`ATLAS_BLUEPRINT.md`** — longer architectural reference

## Middleware / session refresh

Auth session refresh and cookie handling are implemented in **`proxy.ts`**. Next.js only runs a file named **`middleware.ts`** at the repository root. If sessions do not refresh as expected in production or dev, ensure root `middleware.ts` re-exports the handler and `config` from `proxy.ts` (see comments in `CLAUDE.md`).

---

Indulge Atlas is private software for Indulge Group operations; it is not a public template.
