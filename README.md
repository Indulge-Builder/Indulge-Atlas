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

Create a local env file (e.g. `.env.local`) with at least:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; bypasses RLS where used |

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
| `npm run dev` | Development server |
| `npm run dev:webpack` | Dev server using webpack |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm test` | Vitest |

`npm run types:generate` is a placeholder for generating DB types into `lib/types/database.generated.ts` (the app currently relies on hand-maintained types in `lib/types/database.ts`).

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
