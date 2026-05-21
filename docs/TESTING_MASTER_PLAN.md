# Indulge Atlas — Testing Master Plan

> **Generated**: 2026-04-11 via exhaustive static analysis of all service, action, webhook, and hook files, cross-referenced against `CLAUDE.md`.
> This document is the authoritative test specification. No test code is written here — only the contracts each test must enforce.
> Framework: **Vitest** (unit + integration). DB integration tests use the Supabase local stack or a dedicated test project with `SUPABASE_SERVICE_ROLE_KEY`.

---

## Coverage Map

| File / Surface | Tier |
|---|---|
| `lib/services/evaluateRoutingRules.ts` | 1 |
| `lib/hooks/useSLA_Monitor.ts` (exported pure fns) | 1 |
| `lib/services/fieldMappingEngine.ts` (transformation layer) | 1 |
| `lib/services/leadIngestion.ts` (IST helpers, name splitter) | 1 |
| `lib/utils/phone.ts` | 1 |
| `lib/utils/sanitize.ts` | 1 |
| `lib/utils/webhook.ts` | 1 |
| `app/api/webhooks/whatsapp/route.ts` (pure helpers) | 1 |
| `public.leads` RLS — all 5 roles | 2 |
| `public.profiles` RLS — all 5 roles | 2 |
| `public.tasks` RLS — all 5 roles | 2 |
| `public.lead_activities` RLS — immutability | 2 |
| `public.whatsapp_messages` RLS | 2 |
| `get_user_role()` / `get_user_domain()` DB functions | 2 |
| `pick_next_agent_for_domain()` DB function | 2 |
| `POST /api/webhooks/leads/meta` | 3 |
| `POST /api/webhooks/leads/google` | 3 |
| `POST /api/webhooks/leads/website` | 3 |
| `POST /api/webhooks/whatsapp` | 3 |
| `GET /api/webhooks/whatsapp` (Meta verification) | 3 |
| Dynamic Field Mapping Engine (`applyFieldMappings`) | 3 |
| Rate limiting (`checkWebhookRateLimit`) | 3 |
| `updateLeadStatus` server action | 4 |
| `markAttemptedAndScheduleRetry` server action | 4 |
| `closeWonDeal` server action | 4 |
| `createShopTask` server action | 4 |
| `registerTaskSale` server action | 4 |
| Full Lead Lifecycle (new → won → client) | 4 |

---

## Tier 1 — Core Business Logic (Pure Unit Tests)

> All functions in this tier are **pure or near-pure** — they accept inputs and return outputs with no database I/O. Tests run in < 1 ms each with zero mocking overhead.

---

### 1.1 `evaluateRulesAgainstLead` (`lib/services/evaluateRoutingRules.ts`)

#### Rule Matching

| ID | Test Description |
|---|---|
| T1.1.01 | **Exact match wins.** A rule with `condition_operator = 'equals'` and `condition_value = 'concierge_launch'` must match a payload where `utm_campaign = 'concierge_launch'`. Returns `{ action_type: 'assign_to_agent', action_target_uuid: <uuid> }`. |
| T1.1.02 | **Case-insensitive equals.** A rule with `condition_value = 'META'` must match a payload where `utm_source = 'meta'`. The comparison must be case-insensitive on both sides. |
| T1.1.03 | **Contains operator.** A rule with `operator = 'contains'` and `condition_value = 'griffin'` must match `utm_campaign = 'griffin_event_2026'`. |
| T1.1.04 | **Contains with empty pattern returns false.** A `contains` rule where `condition_value` is an empty string must never match any payload field. |
| T1.1.05 | **Starts-with operator.** A rule with `operator = 'starts_with'` and `condition_value = 'google'` must match `utm_medium = 'google_search'` but NOT `utm_medium = 'paid_google'`. |
| T1.1.06 | **Starts-with with empty pattern returns false.** A `starts_with` rule where `condition_value` is empty must never match. |
| T1.1.07 | **Unknown operator returns false.** A rule with an unrecognised `condition_operator` value (e.g., `'regex'`) must not match and must not throw. |

#### Priority & First-Match-Wins

| ID | Test Description |
|---|---|
| T1.1.08 | **Priority ordering is enforced.** Given rules `[{priority: 10, ...}, {priority: 1, ...}]` passed in reverse order, the rule with `priority = 1` must fire first because the function re-sorts before evaluation. |
| T1.1.09 | **First matching rule wins; lower-priority rules are not evaluated.** When two rules both match the payload, only the one with the lower `priority` integer must be returned. |
| T1.1.10 | **Inactive rule is skipped.** A rule with `is_active = false` must be skipped even if its condition would otherwise match the payload. |
| T1.1.11 | **No match returns null.** When no rule matches the payload, the function must return `null`. |
| T1.1.12 | **Empty rules array returns null.** Passing `[]` as the rules list must return `null` immediately without throwing. |

#### Field Resolution

| ID | Test Description |
|---|---|
| T1.1.13 | **`source` field falls back to `utm_source`.** When the payload has no `source` key (or it is blank), a rule matching `condition_field = 'source'` must evaluate against `utm_source` as the fallback value. |
| T1.1.14 | **`source` field: non-empty raw source takes precedence over utm_source.** When both `source = 'pabbly_custom'` and `utm_source = 'meta'` are present, `condition_field = 'source'` must evaluate against `'pabbly_custom'`. |
| T1.1.15 | **Unknown `condition_field` resolves to empty string.** A rule with `condition_field = 'nonexistent_key'` must produce an empty-string comparison value, and therefore must not match any non-empty pattern. |
| T1.1.16 | **Null payload object is coerced to empty object.** Passing `null` as `leadPayload` must not throw; it must be treated as `{}` and all rules must fail their conditions. |

#### Action Type Validation

| ID | Test Description |
|---|---|
| T1.1.17 | **`assign_to_agent` without `action_target_uuid` is skipped.** A matching rule with `action_type = 'assign_to_agent'` and a null/empty `action_target_uuid` must be skipped; the engine must continue to the next rule. |
| T1.1.18 | **`route_to_domain_pool` without `action_target_domain` is skipped.** A matching rule with `action_type = 'route_to_domain_pool'` and a blank `action_target_domain` must be skipped. |
| T1.1.19 | **`route_to_domain_pool` returns the trimmed domain string.** A matching rule with `action_target_domain = '  indulge_shop  '` must return `action_target_domain = 'indulge_shop'` (trimmed). |

---

### 1.2 SLA Engine (`lib/hooks/useSLA_Monitor.ts` — exported pure functions)

#### `computeBreachLevel`

| ID | Test Description |
|---|---|
| T1.2.01 | **On-duty: no breach before 5 minutes.** A lead assigned 4 minutes and 59 seconds ago with `is_off_duty = false` must return `null`. |
| T1.2.02 | **On-duty: Level 1 at exactly 5 minutes.** A lead assigned exactly 5 minutes ago must return `1`. |
| T1.2.03 | **On-duty: Level 2 at exactly 10 minutes.** A lead assigned exactly 10 minutes ago must return `2`. |
| T1.2.04 | **On-duty: Level 3 at exactly 15 minutes.** A lead assigned exactly 15 minutes ago must return `3`. |
| T1.2.05 | **On-duty: Level 3 at 30 minutes (no level above 3).** A lead assigned 30 minutes ago must return `3`, not a higher value. |
| T1.2.06 | **Off-duty: returns null before 9 AM anchor.** A lead created at 2 AM IST queried at 8:59 AM IST must return `null` — the SLA clock has not started. |
| T1.2.07 | **Off-duty: Level 1 at 60 minutes past 9 AM anchor.** A lead created at 11 PM IST, queried at 10:00 AM IST the next day (60 minutes post-anchor), must return `1`. |
| T1.2.08 | **Off-duty: Level 2 at 90 minutes past 9 AM anchor.** Same lead queried at 10:30 AM IST must return `2`. |
| T1.2.09 | **Off-duty: Level 3 at 120 minutes past 9 AM anchor.** Same lead queried at 11:00 AM IST must return `3`. |
| T1.2.10 | **Off-duty anchor for 18:00–23:59 IST creation is NEXT day 9 AM.** A lead created at 22:00 IST on day D must have its anchor at 09:00 IST on day D+1. |
| T1.2.11 | **Off-duty anchor for 00:00–08:59 IST creation is SAME day 9 AM.** A lead created at 03:00 IST on day D must have its anchor at 09:00 IST on day D (not D+1). |

#### `getMinsWaiting`

| ID | Test Description |
|---|---|
| T1.2.12 | **On-duty: returns integer minutes elapsed since `assignedAt`.** For a lead assigned 7.5 minutes ago, must return `7` (floor, not round). |
| T1.2.13 | **Off-duty: returns minutes elapsed since 9 AM anchor, not since `assignedAt`.** A lead assigned at 23:00 IST queried at 10:15 AM next day must return `75`, not the raw minutes since 23:00. |
| T1.2.14 | **Off-duty: returns 0 when before 9 AM anchor (not negative).** Must clamp to 0 using `Math.max`. |

---

### 1.3 Field Mapping Engine — Transformation Layer (`lib/services/fieldMappingEngine.ts`)

> The `applyTransformation` and `getNestedValue` functions must be exported or tested via a thin test-only re-export wrapper.

#### `applyTransformation`

| ID | Test Description |
|---|---|
| T1.3.01 | **`lowercase` rule converts to lowercase.** Input `'JOHN DOE'` with rule `'lowercase'` must return `'john doe'`. |
| T1.3.02 | **`uppercase` rule converts to uppercase.** Input `'john doe'` with rule `'uppercase'` must return `'JOHN DOE'`. |
| T1.3.03 | **`trim` rule removes leading/trailing whitespace.** Input `'  hello  '` with rule `'trim'` must return `'hello'`. |
| T1.3.04 | **`extract_numbers` strips all non-digit characters.** Input `'+91 98765-43210 ext'` with rule `'extract_numbers'` must return `'919876543210'`. |
| T1.3.05 | **`capitalize` upcases first char, lowercases rest.** Input `'jOHN'` must return `'John'`. |
| T1.3.06 | **Null or undefined rule is a passthrough.** Passing `null` or `undefined` as the rule must return the original value unchanged. |
| T1.3.07 | **Unknown rule string is a passthrough.** Rule `'magic_transform'` must return the original value unchanged without throwing. |
| T1.3.08 | **Rule matching is case-insensitive.** Rule `'LOWERCASE'` must behave identically to `'lowercase'`. |

#### `getNestedValue`

| ID | Test Description |
|---|---|
| T1.3.09 | **Top-level key resolves correctly.** `getNestedValue({ phone: '123' }, 'phone')` must return `'123'`. |
| T1.3.10 | **Dot-notation path resolves nested value.** `getNestedValue({ payload: { phone_number: '999' } }, 'payload.phone_number')` must return `'999'`. |
| T1.3.11 | **Missing intermediate key returns undefined, not throw.** `getNestedValue({ a: {} }, 'a.b.c')` must return `undefined` without throwing. |
| T1.3.12 | **Path on a non-object leaf returns undefined.** `getNestedValue({ a: 'string' }, 'a.b')` must return `undefined`. |

---

### 1.4 Lead Ingestion Helpers (`lib/services/leadIngestion.ts`)

> These internal helpers are not exported; testing requires either exporting them for test purposes or extracting them to a separate utility module. The plan assumes they will be exported behind an `// @internal` annotation for test access.

#### `splitFullName`

| ID | Test Description |
|---|---|
| T1.4.01 | **Single-word name: `first_name` = the word, `last_name` = null.** Input `'Priya'` must return `{ first_name: 'Priya', last_name: null }`. |
| T1.4.02 | **Two-word name: splits on first space.** Input `'Raj Kumar'` must return `{ first_name: 'Raj', last_name: 'Kumar' }`. |
| T1.4.03 | **Multi-word name: first token is first_name, remainder is last_name.** Input `'John Paul Getty'` must return `{ first_name: 'John', last_name: 'Paul Getty' }`. |
| T1.4.04 | **Empty string fallback.** Input `''` or `null` must return `{ first_name: 'Unknown Lead', last_name: null }`. |
| T1.4.05 | **Trailing space is trimmed from last_name.** Input `'Raj '` must return `{ first_name: 'Raj', last_name: null }` (trailing space after split makes last_name empty → null). |

#### `isOffDutyInsertion` (IST boundary logic)

| ID | Test Description |
|---|---|
| T1.4.06 | **Returns true at 18:00 IST.** Mocking `Date.now()` to 18:00:00 IST must return `true`. |
| T1.4.07 | **Returns true at 23:59 IST.** Must return `true`. |
| T1.4.08 | **Returns true at 00:00 IST.** Must return `true`. |
| T1.4.09 | **Returns true at 08:59 IST.** Must return `true`. |
| T1.4.10 | **Returns false at 09:00 IST.** Must return `false`. |
| T1.4.11 | **Returns false at 17:59 IST.** Must return `false`. |

---

### 1.5 Phone Utilities (`lib/utils/phone.ts`)

#### `normalizeToE164`

| ID | Test Description |
|---|---|
| T1.5.01 | **Valid 10-digit Indian mobile normalizes to E.164.** `'9876543210'` → `'+919876543210'`. *(Already exists — keep and extend.)* |
| T1.5.02 | **Number with spaces normalizes correctly.** `'98765 43210'` → `'+919876543210'`. *(Already exists.)* |
| T1.5.03 | **Pure alphabetic input with no digits returns empty string.** `'hello world!'` → `''`. *(Already exists.)* |
| T1.5.04 | **Empty string input returns empty string.** `''` → `''`. |
| T1.5.05 | **E.164 formatted input passes through unchanged.** `'+919876543210'` → `'+919876543210'`. |
| T1.5.06 | **ISD-prefixed number with `+91`.** `'+91 98765 43210'` → `'+919876543210'`. |
| T1.5.07 | **Fallback for unparseable number: digits get `+91` prefix.** `'0091XXXX'` where libphonenumber fails → `'+910091XXXX'` (digits only prefixed with +91). |
| T1.5.08 | **Null/undefined input does not throw; returns empty string.** Calling `normalizeToE164(null as any)` must return `''`. |

#### `e164LookupVariants`

| ID | Test Description |
|---|---|
| T1.5.09 | **For `+919876543210`, returns at minimum: `+919876543210`, `919876543210`, `9876543210`.** Validates the three primary lookup variants used in the WA inbound phone-match query. |
| T1.5.10 | **For `00919876543210` (double-zero prefix), returns variants including the stripped form `9876543210` and `+919876543210`.** |
| T1.5.11 | **Empty string input returns an empty array.** Must not throw. |
| T1.5.12 | **No duplicate variants in returned array.** The result set must contain only unique strings. |

---

### 1.6 Sanitization (`lib/utils/sanitize.ts`)

| ID | Test Description |
|---|---|
| T1.6.01 | **`sanitizeText` strips `<script>` tags.** `'<script>alert(1)</script>John'` → `'John'`. *(Already exists — keep.)* |
| T1.6.02 | **`sanitizeText` strips all HTML tags.** `'<b>Bold</b>'` → `'Bold'`. *(Already exists.)* |
| T1.6.03 | **`sanitizeText` preserves plain text exactly.** `'Hello World 123!'` must be returned unchanged. |
| T1.6.04 | **`sanitizeText` on null/undefined does not throw; returns empty string.** |
| T1.6.05 | **`sanitizeFormData` truncates objects nested beyond depth 2 to null.** *(Already exists.)* |
| T1.6.06 | **`sanitizeFormData` preserves numbers and booleans.** `{ count: 5, flag: true }` must return `{ count: 5, flag: true }` unchanged. |
| T1.6.07 | **`sanitizeFormData` converts `bigint` values to strings.** `{ id: BigInt(9007199254740991) }` must return `{ id: '9007199254740991' }`. |
| T1.6.08 | **`sanitizeFormData` drops `function` values (returns null for that key).** A key mapped to a function must be `null` in the output. |
| T1.6.09 | **`sanitizeFormData` drops `symbol` values.** A key mapped to a Symbol must be `null` in the output. |
| T1.6.10 | **`sanitizeFormData` truncates oversized payload (> 10 KB UTF-8).** A payload serializing to > 10,240 bytes must return `{ _truncated: true, _max_bytes: 10240, excerpt: <string> }`. |
| T1.6.11 | **`sanitizeFormData` sanitizes string leaves of nested arrays.** `{ tags: ['<b>tag1</b>', 'clean'] }` must return `{ tags: ['tag1', 'clean'] }`. |

---

### 1.7 Webhook Authentication (`lib/utils/webhook.ts`)

| ID | Test Description |
|---|---|
| T1.7.01 | **`verifyPabblyWebhook` returns null for a valid matching Bearer token.** Request with `Authorization: Bearer <correct_secret>` and matching env var must return `null` (no error). |
| T1.7.02 | **`verifyPabblyWebhook` returns 401 for a mismatched token.** Incorrect Bearer value must return a `NextResponse` with status `401`. |
| T1.7.03 | **`verifyPabblyWebhook` returns 401 when `Authorization` header is absent.** |
| T1.7.04 | **`verifyPabblyWebhook` returns 401 when `Authorization` header is present but not prefixed with `Bearer `.** E.g., `Authorization: Token abc123` must return 401. |
| T1.7.05 | **`verifyPabblyWebhook` uses timing-safe comparison.** Two strings of equal length but different content must still return 401 (not pass due to short-circuit). This validates the `timingSafeEqual` path. |
| T1.7.06 | **`verifyBearerSecret` validates against a named env var, not `PABBLY_WEBHOOK_SECRET`.** Passing `envVarName = 'PABBLY_META_SECRET'` must check `process.env.PABBLY_META_SECRET`, not the generic secret. |
| T1.7.07 | **`verifyBearerSecret` returns 401 when the target env var is not set.** When `process.env[envVarName]` is undefined, must return 401. |

---

### 1.8 WhatsApp Webhook Pure Helpers (`app/api/webhooks/whatsapp/route.ts`)

> These functions are currently unexported. They must be extracted to `lib/utils/whatsapp-helpers.ts` or exported with `// @internal` for testability.

#### `verifyMetaSignature`

| ID | Test Description |
|---|---|
| T1.8.01 | **Returns true for a valid HMAC-SHA256 signature.** Construct `sig = 'sha256=' + hmac(secret, body)`, pass to `verifyMetaSignature(body, sig, secret)` — must return `true`. |
| T1.8.02 | **Returns false for a tampered body.** Valid signature computed against body A must return `false` when body B (different content) is passed. |
| T1.8.03 | **Returns false when signature header does not start with `sha256=`.** A raw hex string without the prefix must return `false`. |
| T1.8.04 | **Returns false for a null/missing signature header.** |
| T1.8.05 | **Comparison is constant-time (uses timingSafeEqual).** Buffers of different lengths must return `false` without throwing. |

#### `extractMessageBody`

| ID | Test Description |
|---|---|
| T1.8.06 | **Type `text`: extracts `text.body`.** Message `{ type: 'text', text: { body: 'Hello' } }` must return `'Hello'`. |
| T1.8.07 | **Type `button`: extracts `button.text`, falls back to `button.payload`.** |
| T1.8.08 | **Type `interactive` with `button_reply`: extracts `button_reply.title`.** |
| T1.8.09 | **Type `interactive` with `list_reply`: extracts `list_reply.title`.** |
| T1.8.10 | **Type `image` with caption: returns caption; without caption, returns null.** |
| T1.8.11 | **Unknown message type returns null.** Message `{ type: 'reaction' }` must return `null`. |
| T1.8.12 | **`text` message with empty body string returns `''` (not null).** This allows the outer filtering (`if (bodyText === null) continue`) to filter, while the empty-string check (`String(bodyText).trim() === ''`) also skips it. |

#### `extractIncomingChats`

| ID | Test Description |
|---|---|
| T1.8.13 | **Well-formed WhatsApp webhook payload extracts all messages.** A payload with 2 messages across 1 entry must return an array of 2 `IncomingChat` objects. |
| T1.8.14 | **`object` field must be `whatsapp_business_account`; other values return empty array.** |
| T1.8.15 | **Messages without a `from` or `id` field are skipped.** |
| T1.8.16 | **Messages with `null` body (extractMessageBody returns null) are skipped.** |
| T1.8.17 | **Messages with empty body text after trim are skipped.** |
| T1.8.18 | **Profile name is resolved from the `contacts` array by matching `wa_id` to `from`.** Payload with matching contact entry must populate `profileName`. |
| T1.8.19 | **Profile name resolves to null when no matching contact is found.** |

---

## Tier 2 — Security & RLS (Database Integration Tests)

> Tests in this tier connect to a **test Supabase instance** using per-role JWT tokens or signed-in test users. They verify that PostgreSQL RLS policies enforce the permission matrix from `CLAUDE.md` Section 2. No application code is called — raw Supabase client queries are issued directly.

---

### 2.1 `public.leads` Row-Level Security

#### Agent Role (`role = 'agent'`)

| ID | Test Description |
|---|---|
| T2.1.01 | **Agent can read their own assigned leads.** `SELECT` from `leads` WHERE `assigned_to = agent.id` must return rows. |
| T2.1.02 | **Agent cannot read leads assigned to another agent in the same domain.** `SELECT` on a lead assigned to `agent_B` while authenticated as `agent_A` must return no rows. |
| T2.1.03 | **Agent cannot read leads from a different domain.** An agent in `indulge_concierge` must receive 0 rows when querying leads with `domain = 'indulge_shop'`. |
| T2.1.04 | **Agent can INSERT a lead in their own domain with themselves as `assigned_to`.** Must succeed with `201`. |
| T2.1.05 | **Agent cannot INSERT a lead in a different domain.** INSERT with `domain = 'indulge_legacy'` while agent is in `indulge_concierge` must fail with RLS violation. |
| T2.1.06 | **Agent can UPDATE a lead assigned to them.** UPDATE on `status` field for own assigned lead must succeed. |
| T2.1.07 | **Agent cannot UPDATE a lead assigned to another agent.** Must be rejected by RLS. |
| T2.1.08 | **Agent cannot DELETE any lead.** DELETE on own assigned lead must be rejected by RLS. |

#### Manager Role (`role = 'manager'`)

| ID | Test Description |
|---|---|
| T2.1.09 | **Manager can read all leads within their domain.** SELECT must return all leads with matching domain regardless of `assigned_to`. |
| T2.1.10 | **Manager cannot read leads from a different domain.** SELECT on leads from another domain must return 0 rows. |
| T2.1.11 | **Manager can UPDATE any lead in their domain.** UPDATE on a lead assigned to another agent must succeed. |
| T2.1.12 | **Manager cannot DELETE leads.** DELETE must be rejected. |
| T2.1.13 | **Manager can INSERT leads in their own domain.** Must succeed. |

#### Admin / Founder Roles

| ID | Test Description |
|---|---|
| T2.1.14 | **Admin can read ALL leads across all domains.** SELECT without any domain filter must return rows from all 4 domains. |
| T2.1.15 | **Admin can DELETE leads.** DELETE on any lead must succeed. |
| T2.1.16 | **Founder can read ALL leads but cannot DELETE.** DELETE must be rejected for `founder` role. |

#### Guest Role (`role = 'guest'`)

| ID | Test Description |
|---|---|
| T2.1.17 | **Guest can SELECT leads in their own domain.** Must return rows. |
| T2.1.18 | **Guest cannot INSERT leads.** Must be rejected. |
| T2.1.19 | **Guest cannot UPDATE leads.** Must be rejected. |
| T2.1.20 | **Guest cannot DELETE leads.** Must be rejected. |

---

### 2.2 `public.profiles` Row-Level Security

| ID | Test Description |
|---|---|
| T2.2.01 | **Agent can only SELECT their own profile row.** SELECT on another agent's profile must return 0 rows. |
| T2.2.02 | **Agent can UPDATE their own profile row.** Must succeed. |
| T2.2.03 | **Agent cannot UPDATE another agent's profile row.** Must be rejected. |
| T2.2.04 | **Manager can SELECT all profiles within their domain.** |
| T2.2.05 | **Manager cannot INSERT new profiles.** User creation is reserved for admin/founder. |
| T2.2.06 | **Admin can SELECT, INSERT, UPDATE, and DELETE profiles.** All four operations must succeed. |
| T2.2.07 | **Founder cannot DELETE profiles.** Must be rejected. |
| T2.2.08 | **Guest can SELECT profiles in own domain.** Must return rows; must not return profiles from other domains. |

---

### 2.3 `public.tasks` Row-Level Security

| ID | Test Description |
|---|---|
| T2.3.01 | **Agent can SELECT tasks where they appear in `assigned_to_users` array.** |
| T2.3.02 | **Agent cannot SELECT tasks assigned to other agents only.** |
| T2.3.03 | **Agent can INSERT a task with themselves in `assigned_to_users`.** |
| T2.3.04 | **Agent cannot INSERT a task assigning it exclusively to another user.** Must be rejected. |
| T2.3.05 | **Agent cannot DELETE tasks.** Must be rejected. |
| T2.3.06 | **Manager can SELECT all tasks for leads in their domain.** |
| T2.3.07 | **Admin can DELETE tasks.** Must succeed. |

---

### 2.4 `public.lead_activities` — Immutability Guarantee

| ID | Test Description |
|---|---|
| T2.4.01 | **Any authenticated user can INSERT a `lead_activities` row for an accessible lead.** INSERT with valid `lead_id` must succeed for agents, managers, and admins. |
| T2.4.02 | **No role can UPDATE a `lead_activities` row.** UPDATE on any row must be rejected — the audit log is immutable. |
| T2.4.03 | **No role can DELETE a `lead_activities` row.** DELETE must be rejected for all roles including admin. |

---

### 2.5 `public.whatsapp_messages` Row-Level Security

| ID | Test Description |
|---|---|
| T2.5.01 | **Agent can SELECT messages for leads assigned to them.** |
| T2.5.02 | **Agent cannot SELECT messages for leads assigned to other agents.** |
| T2.5.03 | **Agent can INSERT messages for leads assigned to them.** |
| T2.5.04 | **Guest cannot INSERT WhatsApp messages.** Must be rejected. |
| T2.5.05 | **Admin can SELECT all WhatsApp messages across domains.** |

---

### 2.6 `get_user_role()` and `get_user_domain()` Database Functions

| ID | Test Description |
|---|---|
| T2.6.01 | **`get_user_role()` returns the role from JWT `user_metadata` for an active session.** After signing in as a user whose JWT encodes `role = 'manager'`, calling `SELECT get_user_role()` must return `'manager'`. |
| T2.6.02 | **`get_user_role()` falls back to the `profiles` table when `user_metadata.role` is absent.** A JWT with no `role` in `user_metadata` but a `profiles` row with `role = 'agent'` must return `'agent'`. |
| T2.6.03 | **`get_user_role()` defaults to `'agent'` when neither JWT nor profiles row provides a role.** |
| T2.6.04 | **`get_my_role()` is an exact alias for `get_user_role()`.** Both calls must return identical values for the same session. |
| T2.6.05 | **`get_user_domain()` returns the domain from JWT `user_metadata` for an active session.** |
| T2.6.06 | **`get_user_domain()` defaults to `'indulge_concierge'` when neither JWT nor profiles row provides a domain.** |

---

### 2.7 `pick_next_agent_for_domain()` Database Function

| ID | Test Description |
|---|---|
| T2.7.01 | **Returns the agent with the fewest new leads in the specified domain.** Given agents A (2 new leads) and B (5 new leads) in `indulge_concierge`, must return A's UUID. |
| T2.7.02 | **Skips agents with `is_on_leave = true`.** An agent on leave must never be returned even if they have the fewest leads. |
| T2.7.03 | **Respects the `p_allowed_uuids` filter.** When `p_allowed_uuids` is provided, only those UUIDs are considered; the function must not return a UUID outside the allowed list. |
| T2.7.04 | **Returns null when no eligible agents exist in the domain.** If all agents are on leave or the domain is empty, must return `null` without error. |
| T2.7.05 | **Caps any agent at 15 new leads (the Samson cap, enforced at DB level).** An agent with 15 or more new leads must be excluded from the pool when the cap logic is applied. |

---

## Tier 3 — The Data Front Door (Webhook & API Integration Tests)

> Tests in this tier make HTTP requests against the Next.js route handlers (via `Request` objects in Vitest, or against a running dev server). They verify the complete request → response cycle including authentication, payload parsing, transformation, ingestion, and logging.

---

### 3.1 `POST /api/webhooks/leads/meta`

#### Authentication

| ID | Test Description |
|---|---|
| T3.1.01 | **Request with no `Authorization` header returns `401`.** |
| T3.1.02 | **Request with wrong Bearer token returns `401`.** |
| T3.1.03 | **Request with correct Bearer token proceeds to processing (returns `200` or `400`).** |

#### Rate Limiting

| ID | Test Description |
|---|---|
| T3.1.04 | **101st request from the same IP within a 60-second window returns `429 Too Many Requests`.** Requires Upstash mock or a real test Redis instance. |
| T3.1.05 | **Rate limit header `X-RateLimit-Remaining` decrements with each request.** (If exposed via response headers.) |

#### Payload Parsing & Field Mapping

| ID | Test Description |
|---|---|
| T3.1.06 | **Non-JSON body returns `400`.** Sending `Content-Type: text/plain` must return `{ error: "Request body must be valid JSON." }`. |
| T3.1.07 | **Empty JSON body (null) returns `400`.** |
| T3.1.08 | **Valid flat payload (no `raw_meta_fields`) creates a lead with correct UTM values.** `{ first_name: 'Alice', phone_number: '9876543210', utm_source: 'meta', utm_medium: 'facebook' }` must insert a lead and return `{ success: true, lead_id: <uuid> }`. |
| T3.1.09 | **`raw_meta_fields` array is correctly parsed.** A payload with `raw_meta_fields: [{ name: 'full_name', values: ['Ravi Kumar'] }, { name: 'phone_number', values: ['9876543210'] }]` must create a lead with `first_name = 'Ravi'` and `last_name = 'Kumar'`. |
| T3.1.10 | **`raw_meta_fields` with malformed JSON string does not crash; falls back gracefully.** A `raw_meta_fields: "invalid json"` must log a warning and continue processing from top-level keys. |
| T3.1.11 | **Top-level `phone` key aliases to `phone_number` when `phone_number` is absent.** A payload with only `phone: '9876543210'` must still produce a lead with `phone_number` set. |
| T3.1.12 | **Dynamic mapping engine is used when DB mappings exist.** When the mock DB returns field mapping rows for the `meta` channel, the response body includes `_engine: 'dynamic'`. |
| T3.1.13 | **Unmapped fields are stored in `form_data` (zero data loss).** A payload with extra keys not in any mapping must appear in `leads.form_data`. |
| T3.1.14 | **Invalid domain in payload is silently coerced to `indulge_concierge`.** Payload with `domain: 'invalid_domain'` must insert a lead with `domain = 'indulge_concierge'`. |
| T3.1.15 | **`enqueueWebhookLog` is called for every valid request.** Mock the function and verify it is called with source `'meta'` and the raw body object. |

---

### 3.2 `POST /api/webhooks/leads/google` and `POST /api/webhooks/leads/website`

| ID | Test Description |
|---|---|
| T3.2.01 | **Google endpoint uses `PABBLY_GOOGLE_SECRET`, not the meta or generic secret.** A request with the meta secret against the google endpoint must return `401`. |
| T3.2.02 | **Website endpoint uses `PABBLY_WEBSITE_SECRET`.** Same isolation check. |
| T3.2.03 | **Google webhook sets `utm_source = 'google'` by default when not provided.** |
| T3.2.04 | **Website webhook sets `utm_source = 'website'` by default when not provided.** |

---

### 3.3 `POST /api/webhooks/whatsapp` — Inbound Message Processing

#### Security

| ID | Test Description |
|---|---|
| T3.3.01 | **Request without `X-Hub-Signature-256` header returns `401`.** |
| T3.3.02 | **Request with invalid HMAC signature returns `401`.** |
| T3.3.03 | **Request with valid HMAC signature returns `200 { received: true }` immediately.** Processing is deferred via `after()`. |
| T3.3.04 | **When `WHATSAPP_APP_SECRET` env var is not set, returns `500` with `Server misconfiguration`.** This enforces the misconfiguration gate. |
| T3.3.05 | **Rate limiting: 101st request from the same IP returns `429`.** |

#### Message Processing Logic

| ID | Test Description |
|---|---|
| T3.3.06 | **Duplicate message (same `wa_message_id`) is idempotent — not inserted twice.** Sending the same payload twice must result in exactly one `whatsapp_messages` row. |
| T3.3.07 | **Inbound message from a known lead (matching `phone_number`) creates a `whatsapp_messages` row linked to that lead.** |
| T3.3.08 | **Inbound message from an unknown number creates a new lead AND a `whatsapp_messages` row.** Verifies `processAndInsertLead` is called with `utm_source = 'whatsapp'` and `utm_medium = 'whatsapp_cloud'`. |
| T3.3.09 | **Phone lookup uses E.164 variants.** A stored phone `+919876543210` must be found when the incoming `wa_id` is `919876543210` (no `+` prefix). |
| T3.3.10 | **New lead created from WhatsApp has `whatsapp_wa_id` in `form_data`.** |
| T3.3.11 | **Non-text message types (image, video, document without caption) produce null body and are skipped.** No `whatsapp_messages` row and no new lead should be created. |
| T3.3.12 | **Invalid JSON body returns `400`.** |

### 3.4 `GET /api/webhooks/whatsapp` — Meta Webhook Verification

| ID | Test Description |
|---|---|
| T3.4.01 | **Valid challenge request returns the `hub.challenge` value as plain text with status 200.** Query params: `hub.mode=subscribe`, `hub.verify_token=<correct>`, `hub.challenge=abc123` must return body `'abc123'`. |
| T3.4.02 | **Wrong `hub.verify_token` returns `403 Forbidden`.** |
| T3.4.03 | **Missing `hub.mode` returns `403`.** |
| T3.4.04 | **Missing `hub.challenge` returns `403`.** |

---

### 3.5 Dynamic Field Mapping Engine — `applyFieldMappings` (Integration with DB)

| ID | Test Description |
|---|---|
| T3.5.01 | **When no mapping rows exist for channel, returns `hasMappings: false` with empty objects.** Mock the Supabase RPC to return `[]`. |
| T3.5.02 | **When RPC errors, returns `hasMappings: false` (fail-open).** Mock the RPC to return an error — engine must not throw. |
| T3.5.03 | **Single mapping row correctly maps `incoming_json_key → target_db_column`.** |
| T3.5.04 | **Dot-notation key (`payload.phone`) is resolved from nested payload.** |
| T3.5.05 | **Transformation is applied before writing to `mappedFields`.** Rule `uppercase` on value `'hello'` must produce `HELLO` in `mappedFields`. |
| T3.5.06 | **Fallback value is used when incoming value is null or empty.** Mapping with `fallback_value = 'indulge_concierge'` must set that value when the raw key is absent. |
| T3.5.07 | **Keys not present in any mapping row are placed into `unmappedFormData`.** |
| T3.5.08 | **Mapped top-level keys are NOT duplicated into `unmappedFormData`.** A key that has a mapping row must appear only in `mappedFields`, not in `unmappedFormData`. |
| T3.5.09 | **Null/empty incoming value with no fallback produces no entry in `mappedFields`.** The key must be absent from `mappedFields` entirely rather than set to `null`. |

---

### 3.6 Rate Limiting (`lib/utils/rateLimit.ts`)

| ID | Test Description |
|---|---|
| T3.6.01 | **When `UPSTASH_REDIS_REST_URL` is not set, `checkWebhookRateLimit` returns `success: false` (fail-closed).** This is a security-critical behavior — missing config blocks requests, not allows them. |
| T3.6.02 | **IP is extracted from `X-Forwarded-For` header (first IP in comma-separated list).** |
| T3.6.03 | **IP falls back to `X-Real-IP` when `X-Forwarded-For` is absent.** |
| T3.6.04 | **IP falls back to `'unknown-ip'` when both headers are absent.** |
| T3.6.05 | **Custom `identifier` parameter overrides IP extraction.** Passing `identifier = 'pabbly-fixed-ip'` must use that string as the rate-limit key. |

---

## Tier 4 — Critical User Journeys (Server Actions & E2E Tests)

> Tests in this tier call Next.js Server Actions directly (imported as async functions in Vitest) against a seeded test database. They verify the complete business logic, authorization, side effects (activity log, task creation, client promotion), and `revalidatePath` calls.

---

### 4.1 `updateLeadStatus` (`lib/actions/leads.ts`)

#### Authorization

| ID | Test Description |
|---|---|
| T4.1.01 | **Agent can update status of their own assigned lead.** `updateLeadStatus(leadId, 'connected')` called as the assigned agent must return `{ success: true }`. |
| T4.1.02 | **Agent cannot update status of a lead assigned to another agent.** Must return `{ success: false, error: 'Unauthorised' }`. |
| T4.1.03 | **Manager can update status of any lead in their domain.** Must return `{ success: true }`. |
| T4.1.04 | **Admin can update status of any lead across all domains.** Must return `{ success: true }`. |

#### `attempt_count` Increment

| ID | Test Description |
|---|---|
| T4.1.05 | **Transitioning to `attempted` increments `attempt_count` by 1.** Starting at `attempt_count = 2`, after the call `leads.attempt_count` must be `3`. |
| T4.1.06 | **Transitioning to any status other than `attempted` does NOT increment `attempt_count`.** |

#### Side Effects

| ID | Test Description |
|---|---|
| T4.1.07 | **A `lead_activities` row is inserted with `action_type = 'status_changed'` and correct `old_status` / `new_status` in `details`.** |
| T4.1.08 | **Transitioning to `won` triggers `triggerFinanceNotification`.** Mock the internal `fetch` and verify it is called with the correct `leadId`. |
| T4.1.09 | **Transitioning to `nurturing` calls `createNurturingTask`, which inserts a `general_follow_up` task due ~3 months out.** Verify `tasks` row exists with `task_type = 'general_follow_up'` and `due_date` approximately 90 days in the future. |

---

### 4.2 `markAttemptedAndScheduleRetry` — 3-Strike Nurture Engine

| ID | Test Description |
|---|---|
| T4.2.01 | **Increments `attempt_count` by 1 in `leads` table.** |
| T4.2.02 | **Sets `status = 'attempted'` in `leads` table.** |
| T4.2.03 | **Inserts a `call_attempt` activity row in `lead_activities`.** Payload must include `outcome: 'no_answer'` and `retry_scheduled_at`. |
| T4.2.04 | **Inserts a `tasks` row of type `call` with `due_date` equal to the `retryAt` argument.** |
| T4.2.05 | **On the 1st and 2nd scheduled retry, `showNurtureToast` is `false`.** |
| T4.2.06 | **On the 3rd scheduled retry (when `call_attempt` activity count becomes 3), `showNurtureToast` is `true`.** This is the definitive 3-strike trigger verification. |
| T4.2.07 | **Unauthorized agent (not the assigned one, non-privileged role) receives `{ success: false, error: 'Unauthorised' }`.** |

---

### 4.3 `closeWonDeal` — Full Won Deal Journey

| ID | Test Description |
|---|---|
| T4.3.01 | **Zod validation rejects `dealValue = 0` (must be positive).** Must return `{ success: false, error: 'Deal value must be greater than zero' }`. |
| T4.3.02 | **Zod validation rejects empty `dealDuration` string.** |
| T4.3.03 | **Zod validation rejects non-UUID `leadId`.** |
| T4.3.04 | **Unauthorized agent cannot close a deal on a lead they don't own.** Must return `{ success: false, error: 'Unauthorised' }`. |
| T4.3.05 | **Successful call sets `leads.status = 'won'`, `leads.deal_value`, and `leads.deal_duration`.** All three columns must reflect the passed values. |
| T4.3.06 | **A new row is inserted into `public.clients` with `lead_origin_id = leadId` and `membership_status = 'active'`.** This is the lead-to-client promotion verification. |
| T4.3.07 | **`clients` insert failure is non-fatal — the deal closes successfully anyway.** Mock the clients insert to error; `closeWonDeal` must still return `{ success: true }`. |
| T4.3.08 | **A `lead_activities` row is inserted with `type = 'status_change'`, `from = <old_status>`, `to = 'won'`, and `deal_value` / `deal_duration` in payload.** |
| T4.3.09 | **`triggerFinanceNotification` is called with the correct `leadId` and `agentId`.** |

---

### 4.4 Full Lead Lifecycle Integration Test (End-to-End)

> A single sequential test that seeds a lead and walks it through the entire pipeline, asserting database state at each step.

| ID | Test Description |
|---|---|
| T4.4.01 | **Step 1 — Lead created via `processAndInsertLead`.** `leads` table has 1 new row with `status = 'new'`, `assigned_to` set, `is_off_duty` flag correct for the test time, and a `lead_created` activity row. |
| T4.4.02 | **Step 2 — Agent calls `markAttemptedAndScheduleRetry` once.** `status = 'attempted'`, `attempt_count = 1`, `showNurtureToast = false`. |
| T4.4.03 | **Step 3 — Agent calls `markAttemptedAndScheduleRetry` again (2nd attempt).** `attempt_count = 2`, `showNurtureToast = false`. |
| T4.4.04 | **Step 4 — Agent calls `markAttemptedAndScheduleRetry` a 3rd time.** `attempt_count = 3`, `showNurtureToast = true`. |
| T4.4.05 | **Step 5 — Agent calls `updateLeadStatus(leadId, 'connected')`.** `status = 'connected'`, activity row logged. |
| T4.4.06 | **Step 6 — Agent calls `updateLeadStatus(leadId, 'in_discussion')`.** `status = 'in_discussion'`. |
| T4.4.07 | **Step 7 — Agent calls `closeWonDeal(leadId, 50000, '3 months')`.** `status = 'won'`, `deal_value = 50000`, `deal_duration = '3 months'`. A `clients` row exists with `lead_origin_id = leadId`. Finance notification fired. |
| T4.4.08 | **SLA breach is correctly computed** for the lead created at a known mock timestamp, on-duty: 5 minutes past `assigned_at` must resolve `computeBreachLevel` to `1`. |

---

### 4.5 `createShopTask` — Shop War Room (`lib/actions/shop-tasks.ts`)

#### Zod Schema Validation

| ID | Test Description |
|---|---|
| T4.5.01 | **Individual scope with more than 1 assignee returns validation error.** |
| T4.5.02 | **Individual scope with exactly 1 assignee passes schema validation.** |
| T4.5.03 | **Group scope with only 1 assignee returns validation error.** |
| T4.5.04 | **Group scope with 2 or more assignees passes schema validation.** |
| T4.5.05 | **`has_target = true` without `target_inventory` returns validation error.** |
| T4.5.06 | **`has_target = true` with `target_inventory = 0` returns validation error (must be ≥ 1).** |
| T4.5.07 | **`has_target = true` without `shop_product_name` returns validation error.** |
| T4.5.08 | **`has_target = false` allows null `target_inventory` and null `shop_product_name`.** |

#### Authorization

| ID | Test Description |
|---|---|
| T4.5.09 | **User with `domain = 'indulge_concierge'` and `role = 'agent'` is denied access (`canAccessShopSurfaces` returns false).** Must return `{ success: false, error: 'Shop workspace access required.' }`. |
| T4.5.10 | **User with `domain = 'indulge_shop'` and any role is granted access.** |
| T4.5.11 | **User with `role = 'admin'` regardless of domain is granted access.** |

#### DB Side Effects

| ID | Test Description |
|---|---|
| T4.5.12 | **A `tasks` row is inserted with `lead_id = null`, `shop_operation_scope` set, `task_type = 'whatsapp_message'`, and `target_sold = 0`.** |
| T4.5.13 | **`target_inventory` is null in the `tasks` row when `has_target = false`.** |

---

### 4.6 `registerTaskSale` — Atomic Target Increment (`lib/actions/shop-tasks.ts`)

| ID | Test Description |
|---|---|
| T4.6.01 | **Non-assigned agent (non-elevated role) cannot register a sale.** Must return `{ success: false, error: 'You are not assigned to this task.' }`. |
| T4.6.02 | **Admin can register a sale on any task regardless of assignment.** |
| T4.6.03 | **A `shop_orders` row is inserted with `task_id`, `customer_name`, `customer_phone`, `amount`, and `status = 'pending'`.** |
| T4.6.04 | **`increment_shop_task_target_sold` RPC is called, and `tasks.target_sold` is incremented by 1 atomically.** Verify by reading `tasks.target_sold` before and after the call. |
| T4.6.05 | **A progress update is appended to `tasks.progress_updates` JSONB array.** The new entry must contain the agent name and customer name. |
| T4.6.06 | **Concurrent calls from two agents increment `target_sold` to 2, not 1 (race condition prevention).** Run two `registerTaskSale` calls in parallel; final `target_sold` must be `2`. |
| T4.6.07 | **`dealAmount = 0` (zero-value deal) is accepted by schema (`nonnegative`) and creates an order.** |
| T4.6.08 | **Non-existent `taskId` returns `{ success: false, error: 'Task not found' }`.** |

---

### 4.7 `sendWhatsAppMessage` — Outbound Flow (`lib/actions/whatsapp.ts`)

| ID | Test Description |
|---|---|
| T4.7.01 | **Unauthenticated call throws or returns an error.** |
| T4.7.02 | **Empty message text is rejected.** |
| T4.7.03 | **Message exceeding 4096 characters is rejected.** |
| T4.7.04 | **Successful send inserts a `whatsapp_messages` row with `direction = 'outbound'` and `status = 'sent'`.** Mock the Meta Graph API to return a successful response. |
| T4.7.05 | **Meta 24-hour window error is surfaced with a user-friendly message, not a raw API error.** Mock the Graph API to return a `24 hour` error; verify the returned error string contains the explanation string. |
| T4.7.06 | **Agent cannot send a WhatsApp message to a lead not assigned to them.** RLS on the `leads` SELECT must reject the fetch; action returns an appropriate error. |

---

## Appendix A — Test Environment Setup

```
# Required environment variables for test suite
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321          # Local Supabase stack
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local_anon_key>
SUPABASE_SERVICE_ROLE_KEY=<local_service_role_key>
PABBLY_WEBHOOK_SECRET=test-pabbly-secret
PABBLY_META_SECRET=test-meta-secret
PABBLY_GOOGLE_SECRET=test-google-secret
PABBLY_WEBSITE_SECRET=test-website-secret
WHATSAPP_VERIFY_TOKEN=test-verify-token
WHATSAPP_APP_SECRET=test-app-secret
INTERNAL_API_SECRET=test-internal-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
UPSTASH_REDIS_REST_URL=<upstash-test-url>
UPSTASH_REDIS_REST_TOKEN=<upstash-test-token>
```

## Appendix B — Test User Seeds Required

For Tier 2 (RLS) tests, the following test users must be seeded in the test Supabase instance with JWT-verifiable `user_metadata`:

| Seed User | Role | Domain |
|---|---|---|
| `test-admin@test.indulge` | `admin` | `indulge_concierge` |
| `test-founder@test.indulge` | `founder` | `indulge_concierge` |
| `test-manager-concierge@test.indulge` | `manager` | `indulge_concierge` |
| `test-agent-concierge-a@test.indulge` | `agent` | `indulge_concierge` |
| `test-agent-concierge-b@test.indulge` | `agent` | `indulge_concierge` |
| `test-agent-shop@test.indulge` | `agent` | `indulge_shop` |
| `test-guest-concierge@test.indulge` | `guest` | `indulge_concierge` |

## Appendix C — Test Count Summary

| Tier | Section | Test Cases |
|---|---|---|
| 1 | Routing Rules Engine | 19 |
| 1 | SLA Engine | 14 |
| 1 | Field Mapping Transformations | 12 |
| 1 | Lead Ingestion Helpers | 11 |
| 1 | Phone Utilities | 12 |
| 1 | Sanitization | 11 |
| 1 | Webhook Auth | 7 |
| 1 | WhatsApp Helpers | 14 |
| **Tier 1 Total** | | **100** |
| 2 | Leads RLS | 20 |
| 2 | Profiles RLS | 8 |
| 2 | Tasks RLS | 7 |
| 2 | Lead Activities (Immutability) | 3 |
| 2 | WhatsApp Messages RLS | 5 |
| 2 | Role/Domain DB Functions | 6 |
| 2 | Agent Assignment Function | 5 |
| **Tier 2 Total** | | **54** |
| 3 | Meta Webhook | 15 |
| 3 | Google/Website Webhooks | 4 |
| 3 | WhatsApp Inbound POST | 12 |
| 3 | WhatsApp GET Verification | 4 |
| 3 | Field Mapping Engine (Integration) | 9 |
| 3 | Rate Limiting | 5 |
| **Tier 3 Total** | | **49** |
| 4 | updateLeadStatus | 9 |
| 4 | markAttemptedAndScheduleRetry | 7 |
| 4 | closeWonDeal | 9 |
| 4 | Full Lifecycle E2E | 8 |
| 4 | createShopTask | 13 |
| 4 | registerTaskSale | 8 |
| 4 | sendWhatsAppMessage | 6 |
| **Tier 4 Total** | | **60** |
| | **Grand Total** | **263** |

---

*End of TESTING_MASTER_PLAN.md — Indulge Atlas SDET Specification*
