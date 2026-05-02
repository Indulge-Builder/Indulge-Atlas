# Auth Audit — Indulge Atlas

**Date:** 2026-04-27 · **Reviewed:** 2026-04-30  
**Scope:** Invite flow, password recovery, callback route, middleware, environment URLs, user-facing errors; cross-cutting notes vs **RLS** and **Server Actions** (see also **`task_details.md`** for task `task_remarks` / service-role system logs).  
**Sources:** `app/(auth)/`, `app/auth/callback/`, `proxy.ts`, `lib/supabase/*`, `lib/actions/auth.ts`, `lib/actions/admin.ts`, admin UI, `.env.example`, `next.config.ts`.

---

## Section 1 — Current Auth Page Inventory

| Route | File | Purpose | End-to-end (pre-fix) |
|-------|------|---------|----------------------|
| `/login` | `app/(auth)/login/page.tsx` | Email/password sign-in (client Supabase + profile-based redirect) | **Working** for valid users; errors were generic only |
| `/forgot-password` | `app/(auth)/forgot-password/page.tsx` | Request reset email via `requestPasswordReset` | **Partially broken:** `redirectTo` fell back to `localhost` when env unset; success UX did not use enumeration-safe copy |
| `/update-password` | `app/(auth)/update-password/page.tsx` | Set password after recovery/invite session | **Partially broken:** depended on PKCE `code` only in callback; invite `redirectTo` defaulted `next` to `/` so users could skip password setup; no `token_hash` handling |

There is **no** `app/api/auth/` directory.

---

## Section 2 — Middleware status

| Item | Finding |
| --- | --- |
| **`proxy.ts`** | Implementation of session refresh + public path allowlist + auth redirects, using `@supabase/ssr` `createServerClient` and `getUser()`. |
| **Root `middleware.ts`** | Next.js only executes middleware exported from a file named **`middleware.ts`** at the **repository root**. Without it, **`proxy.ts` is never run** on the Edge. |
| **Repository state (2026-04-30)** | **`middleware.ts` is not present** in this workspace. Edge session refresh and middleware-level redirects are **not active** until a one-line re-export exists: `export { proxy as middleware, config } from "./proxy"`. |
| **After that file exists** | Session refresh and redirect behaviour described in `proxy.ts` apply; RSC `app/(dashboard)/layout.tsx` remains a second-layer gate. |

> **Task system note:** System-authored `task_remarks` (Atlas timeline) use the **service-role** client in `lib/actions/tasks.ts` so `author_id` can be the synthetic Atlas system user without violating `author_id = auth.uid()` on the user session. This is **not** an auth bug; it is an intentional separation of user tokens vs service operations. See **`task_details.md`** §6 and §10.

---

## Section 3 — Invite Flow Trace

| Step | Status (pre-fix) |
|------|------------------|
| 1. Admin completes Create User wizard (`components/admin/CreateUserModal.tsx` → `createUser` in `lib/actions/admin.ts`) | **Working** |
| 2. `inviteUserByEmail` with `user_metadata`, then `admin.updateUserById` for `app_metadata` | **Working**; metadata failure left orphan auth user (no rollback) — **High** |
| 3. `redirectTo` used `NEXT_PUBLIC_APP_URL ?? http://localhost:3000` + `/auth/callback` **without** `next=/update-password` | **Broken / High** — production without `NEXT_PUBLIC_APP_URL` → localhost links; missing `next` → after exchange user landed on `/` instead of password setup |
| 4. Supabase sends invite email | **Working** (Supabase) |
| 5. User clicks link → Supabase `/auth/v1/verify` → redirect to app `/auth/callback?code=...&next=...` | **Working** when URL correct |
| 6. `app/auth/callback/route.ts` exchanges `code` for session | **Partially broken** — only `code` path; no `token_hash` |
| 7. Redirect to destination | **Broken** for default `next=/` on invite |
| 8. `update-password` page + `updatePassword` Server Action | **Working** only if user arrived with a session and valid flow |

---

## Section 4 — Password Reset Flow Trace

| Step | Status (pre-fix) |
|------|------------------|
| 1. User submits email on `/forgot-password` | **Working** |
| 2. `requestPasswordReset` → `resetPasswordForEmail` with `redirectTo` | **Broken** — used `NEXT_PUBLIC_APP_URL ?? localhost` (`.env.local` had **no** `NEXT_PUBLIC_APP_URL`) |
| 3. Email link | **Broken** in production — pointed at localhost |
| 4. Callback exchange | **Partially broken** — `code` only; recovery relied on `next=/update-password` in query (that part was OK when env was set) |
| 5. `updatePassword` called `updateUser` then **`signOut`** | **Broken UX** — forced re-login instead of entering dashboard as specified |
| 6. Admin “Send reset” from `UsersTable` → `sendPasswordReset` in `admin.ts` | **Broken** — `redirectTo` was `/login`, not callback + password page |

---

## Section 5 — Root Cause Analysis

1. **Localhost in emails:** `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_SITE_URL` were not set in `.env.local`. All `redirectTo` and several absolute redirects defaulted to `http://localhost:3000`.
2. **Invite landing on `/`:** `inviteUserByEmail` `redirectTo` omitted `next=/update-password` (and flow hints), so after `exchangeCodeForSession` the callback redirected to `/`.
3. **Incomplete callback:** `app/auth/callback/route.ts` handled only the PKCE `code` query param. Email flows that deliver `token_hash` + `type` were not supported; missing `code` redirected with `Invalid_Link` only heuristically.
4. **Dead middleware:** No root `middleware.ts` → `proxy.ts` never ran → no edge session refresh or early auth redirects.
5. **Admin-initiated reset wrong target:** `sendPasswordReset` sent users to `/login` after verification instead of the password update surface via `/auth/callback`.
6. **Password update flow:** `signOut()` after `updateUser` contradicted the desired “set password → dashboard” journey and dropped the session before redirect.

---

## Section 6 — Problem List (Severity)

1. **Critical —** No `middleware.ts`; edge session refresh and auth redirects not running.  
2. **Critical —** Auth email `redirectTo` defaulted to localhost when public site URL env vars were unset.  
3. **Critical —** Invite `redirectTo` did not send new users to `/update-password`, so onboarding could skip password setup.  
4. **High —** Auth callback lacked `token_hash` + `type` handling.  
5. **High —** `sendPasswordReset` used wrong `redirectTo` (`/login`).  
6. **High —** `inviteUserByEmail` + `updateUserById` had no rollback on `app_metadata` failure.  
7. **Medium —** Password policy in Zod omitted lowercase until fixed to match stated policy.  
8. **Medium —** Raw Supabase strings shown on login, forgot-password, admin modals, and tables.  
9. **Low —** Forgot-password page confirmed “check your email” via toast only; not enumeration-safe inline copy.

---

## Required Supabase Dashboard Configuration

Configure these in the Supabase project (**Authentication → URL configuration**):

| Setting | Value |
|---------|--------|
| **Site URL** | Production canonical origin (e.g. `https://atlas.yourdomain.com`). For local CLI email testing, use `http://localhost:3000`. |
| **Redirect URLs** (allowlist) | Include every origin you use, for example: `http://localhost:3000/**`, `https://atlas.yourdomain.com/**`, staging URLs. Must cover `https://<host>/auth/callback` and `https://<host>/update-password` paths used in `redirectTo`. |

`redirectTo` passed from the app must match an allowlisted URL pattern. `NEXT_PUBLIC_SITE_URL` (or legacy `NEXT_PUBLIC_APP_URL`) must match the deployed origin so generated links are correct even if the dashboard Site URL is wrong.

---

## Post-fix verification checklist

- [ ] **Add root `middleware.ts`** re-exporting `proxy` (if not present) so Edge session refresh runs.  
- [ ] Set `NEXT_PUBLIC_SITE_URL` on Vercel (and locally in `.env.local`).  
- [ ] Align Supabase **Site URL** and **Redirect URLs** with that origin.  
- [ ] Smoke-test: invite user → email → callback → update password → `/`.  
- [ ] Smoke-test: forgot password → email → callback → update password → `/`.  
- [ ] Smoke-test: admin “password reset” from user table.

---

## Related documentation

| Document | Contents |
| --- | --- |
| **`task_details.md`** | Unified Atlas tasks, Task Insights, `task_remarks` / service-role system logs, migrations **067–079**, RLS and realtime expectations |
| **`ATLAS_BLUEPRINT.md`** | Full platform architecture and migration index |
