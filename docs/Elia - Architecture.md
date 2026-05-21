# Architecture — The System Map

> This document describes **Elia** end-to-end: what is **shipped in Atlas today** (May 2026) and what is **planned** (Chrome extension, pgvector, Gemini vision, workflow orchestration). For day-to-day coding, see **`claude.md`** § Elia integration.
> 

---

# 0. Atlas Production — Shipped (May 2026)

What runs in **Indulge Atlas** today. Model for all paths: **`claude-haiku-4-5-20251001`** via `POST https://api.anthropic.com/v1/messages` (no streaming). Env: **`ANTHROPIC_API_KEY`**.

## 0A — Elia surfaces in Atlas

| Surface | Entry | Data source | Persistence |
| --- | --- | --- | --- |
| `/elia-preview` | `POST /api/elia/chat` | All members — `getEliaClientContext()` | None (stateless per request) |
| Client Overview → chat | Same route + `clientId` | One member — `getEliaSingleClientProfileText` | None |
| Client Overview → summary | `getClientSummary` server action | Member + `client_profiles` + Freshdesk | None (ephemeral text) |
| Service History ticket AI | `getTicketAISummary` | Freshdesk ticket | None |
| Profile → **Elia Intelligence** | `triggerEliaWhatsAppAnalysis` | Chetto WhatsApp timeline | **`client_profiles.elia_profile`** (JSONB) |

## 0B — WhatsApp → structured profile pipeline (Chetto + Elia)

Chetto (**Joule API**) supplies group messages. Elia (Haiku) merges them into a living **`EliaProfile`** JSON document. This is **separate** from the Chetto tab UI (browse chat + Chetto insights) and **separate** from Elia chat.

```mermaid
sequenceDiagram
    participant UI as Profile tab (Elia Intelligence)
    participant SA as triggerEliaWhatsAppAnalysis
    participant SVC as lib/services/eliaProfileAnalysis.ts
    participant CH as lib/actions/chetto.ts (Joule)
    participant AI as Anthropic Haiku
    participant DB as client_profiles (service role)

    UI->>SA: Click Analyse Chat / Update Profile
    SA->>SA: getAuthUser() — manager+ only
    SA->>SVC: runEliaWhatsAppAnalysis(clientId)
    SVC->>DB: SELECT clients + client_profiles (elia_messages_through)
    SVC->>CH: getGroupTimeline(groupId) — paginate
    Note over CH: Resolve group via clients.chetto_group_id<br/>or findClientGroup(phone, queendom)
    CH-->>SVC: messages[] (phone, text, from_me, timestamp)
    SVC->>SVC: Filter since elia_messages_through<br/>e164LookupVariants → isClient<br/>sanitizeText on bodies<br/>Skip if &lt; 5 client messages
  alt No new messages
        SVC-->>SA: { success: true, messagesAnalyzed: 0 }
    else Has messages
        SVC->>AI: buildWhatsAppProfilePrompt(existing + messages)
        AI-->>SVC: JSON EliaProfile
        SVC->>DB: UPDATE client_profiles SET elia_profile, elia_version, elia_analyzed_at, elia_messages_through
        Note over DB: INSERT only if no profile row exists<br/>getServiceSupabaseClient() bypasses RLS
        SVC-->>SA: { success: true, messagesAnalyzed: N }
    end
    SA->>UI: revalidatePath + getClientById refresh
```

**Automation (cron):** `POST /api/elia/analyse-client` — body `{ "clientId": "uuid" }`, Bearer **`ELIA_ANALYSIS_SECRET`** (timing-safe, same pattern as Pabbly webhooks). Calls the same `runEliaWhatsAppAnalysis` — no session auth.

## 0C — Key files (Atlas)

| Path | Role |
| --- | --- |
| `lib/services/eliaProfileAnalysis.ts` | Pipeline orchestrator — **not** `"use server"` |
| `lib/actions/elia.ts` | `triggerEliaWhatsAppAnalysis`, chat context loaders, `getClientSummary` |
| `lib/elia/chat-prompt.ts` | `buildWhatsAppProfilePrompt`, `eliaSystemPrompt`, `eliaClientScopedPrompt` |
| `lib/actions/chetto.ts` | Joule HTTP (`CHETTO_API_KEY`) — **not** `"use server"` |
| `app/api/elia/chat/route.ts` | Interactive chat |
| `app/api/elia/analyse-client/route.ts` | Machine-to-machine analysis trigger |
| `app/api/chetto/*` | Browser session proxies for **ChettoTab** only |
| `components/clients/profile/EliaProfileAnalyseButton.tsx` | Manual trigger UI |
| `components/clients/profile/ClientProfileFields.tsx` | **Elia Intelligence** section (inline display) |
| `supabase/migrations/091_client_profiles_elia_profile.sql` | `elia_profile`, `elia_version`, `elia_analyzed_at`, `elia_messages_through` |
| `supabase/migrations/090_clients_chetto_group_id.sql` | `clients.chetto_group_id` |
| `lib/types/database.ts` | `EliaProfile` interface |

## 0D — `EliaProfile` schema (stored in `client_profiles.elia_profile`)

Top-level shape written by Haiku and persisted as JSONB:

- `summary` — executive paragraph for agents
- `identity` — `sentiment`, `relationship_strength`, `communication_style`, `key_traits[]`
- `travel`, `dining`, `accommodation` — preference objects
- `requests` — `recent[]` (date, description, status), `recurring_themes[]`
- `milestones` — birthdays, anniversaries, other
- `sources` — `analysis_runs`, `message_count_analyzed`, `whatsapp_analyzed_through`
- `version`, `last_updated_at`, `last_updated_by` (`whatsapp_analysis`)

Incremental analysis: only messages **after** `elia_messages_through` are sent; Claude merges with existing JSON; dedupe rule on `requests.recent` by description + date.

## 0E — Security & env (Atlas Elia)

| Env var | Used for |
| --- | --- |
| `ANTHROPIC_API_KEY` | Chat, summary, ticket AI, WhatsApp profile analysis |
| `CHETTO_API_KEY` | Joule timeline (server-only; `lib/actions/chetto.ts`) |
| `CHETTO_ORG_ID` | Optional org scope on Joule routes |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required** for `elia_profile` writes in `eliaProfileAnalysis` |
| `ELIA_ANALYSIS_SECRET` | Bearer auth on `/api/elia/analyse-client` |

> **Chetto vs Elia:** Chetto is a vendor messaging intelligence API. Elia is Indulge’s Claude-powered layer. They share the WhatsApp **data source** but use different keys, code paths, and outputs.

---

# 1. The 3 Planes (Vision + Atlas)

> Sections **1–12** below include **future** capabilities (Chrome extension, Gemini screen vision, pgvector semantic cache, Claude Sonnet orchestration). Where Atlas differs today, **§0** is authoritative.

Elia is not a standalone app. She is an intelligence layer stitched across three planes:

| Plane | What Lives Here |
| --- | --- |
| **Data Plane** | Supabase (PostgreSQL + pgvector), AWS S3, WhatsApp, Freshdesk |
| **Intelligence Plane** | Gemini Flash (perception), Claude 4.6 (reasoning), Jina (embeddings), Whisper (audio) |
| **Interaction Plane** | Chrome Extension (desktop), Floating Assistant (mobile), Atlas web UI |

Data flows up from the Data Plane, intelligence is applied in the Intelligence Plane, and results surface in the Interaction Plane. Agents always have the final say before any action executes.

---

# 2. Top-Level System Architecture

```mermaid
flowchart TD
    subgraph SOURCES [" External Data Sources "]
        WA[WhatsApp Cloud API]
        FD[Freshdesk]
        META[Meta Lead Ads]
        WEB[Website Forms]
        SOC[Social Media]
        AUDIO[Meeting Audio - Offline]
        VENDOR[Websites - Live DOM]
    end

    subgraph INGEST [" Ingestion Layer "]
        PABBLY[Pabbly Connect]
        WHOOK[Webhook - whatsapp]
        LEDHOOK[Webhook - leads - meta + google + website]
        JINABATCH[Jina v3 Batch Embedder]
        WHISPER[Whisper on AWS GPU]
    end

    subgraph VAULT [" Supabase Data Vault "]
        PG[(PostgreSQL)]
        VEC[(pgvector - JINA Embedding Index)]
        RLS{RLS Enforcer - get_user_role - get_user_domain}
        REALTIME[Supabase Realtime]
    end

    subgraph CACHE [" Speed Layer "]
        REDIS[Upstash Redis - Semantic Cache]
    end

    subgraph AI [" Intelligence Layer "]
        GEM[Gemini 3.1 Flash - Screen Vision]
        CLAUDE[Claude 4.6 Sonnet - Reasoning Engine]
        HAIKU[Claude Haiku - Fast Intent]
    end

    subgraph ATLAS [" Atlas API Layer - Next.js "]
        ACTIONS[Server Actions]
        APIROUTES[API Route Handlers]
        CTXAPI[Context API - elia context endpoint]
    end

    subgraph UI [" Agent Interfaces "]
        EXT[Chrome Extension - Desktop]
        FLOAT[Floating Assistant - Mobile]
        SIDEBAR[Elia Sidebar Panel - Atlas Web]
    end

    WA --> WHOOK
    FD --> INGEST
    META --> PABBLY
    WEB --> PABBLY
    PABBLY --> LEDHOOK
    SOC --> JINABATCH
    AUDIO --> WHISPER
    WHISPER --> JINABATCH
    WHOOK --> PG
    LEDHOOK --> PG
    JINABATCH --> VEC
    PG --> RLS
    VEC --> RLS
    RLS --> ACTIONS
    RLS --> CTXAPI
    PG --> REALTIME
    REALTIME --> ATLAS
    CTXAPI --> REDIS
    REDIS -->|Cache Hit| UI
    REDIS -->|Cache Miss| CLAUDE
    VENDOR --> GEM
    GEM -->|Conflict Detected| CLAUDE
    GEM -->|No Conflict| UI
    CLAUDE --> HAIKU
    HAIKU --> CTXAPI
    CLAUDE --> ATLAS
    ATLAS --> ACTIONS
    ACTIONS --> PG
    CTXAPI --> EXT
    CTXAPI --> FLOAT
    CTXAPI --> SIDEBAR
```

---

# 3. Data Ingestion Flows

## 3A — Lead Ingestion (Meta / Google / Website)

```mermaid
sequenceDiagram
    participant AD as Ad Platform
    participant PAB as Pabbly Connect
    participant HOOK as /api/webhooks/leads/{channel}
    participant RL as Rate Limiter (Upstash)
    participant AUTH as Bearer Auth
    participant FM as Field Mapping Engine
    participant RT as Routing Engine
    participant DB as Supabase (leads table)
    participant ELIA as Elia Context API

    AD->>PAB: Form submission
    PAB->>HOOK: POST with Bearer token
    HOOK->>RL: Check rate limit (100/min/IP)
    RL-->>HOOK: Allowed
    HOOK->>AUTH: Verify PABBLY_{CHANNEL}_SECRET
    AUTH-->>HOOK: Valid
    HOOK->>FM: Map raw fields via DB rules
    FM->>RT: Evaluate routing rules (first-match-wins)
    RT-->>FM: Agent assignment + domain
    FM->>DB: INSERT lead + lead_activity
    DB-->>ELIA: New lead available for context
```

## 3B — WhatsApp Two-Way Sync

```mermaid
sequenceDiagram
    participant CLIENT as Client (WhatsApp)
    participant META as Meta Cloud API
    participant HOOK as /api/webhooks/whatsapp
    participant HMAC as HMAC-SHA256 Verify
    participant DB as Supabase
    participant AGENT as Agent (Atlas UI)
    participant ELIA as Elia

    CLIENT->>META: Sends message
    META->>HOOK: POST webhook
    HOOK->>HMAC: Verify WHATSAPP_APP_SECRET
    HMAC-->>HOOK: Valid — return 200 immediately
    HOOK->>DB: after() async — deduplicate by wa_message_id
    DB->>DB: Phone lookup variants → match to lead
    DB->>DB: INSERT whatsapp_messages (inbound)
    DB->>ELIA: Message available for embedding
    AGENT->>DB: sendWhatsAppMessage() via Server Action
    DB->>META: POST Graph API v19.0
    META->>CLIENT: Delivers message
    DB->>DB: INSERT whatsapp_messages (outbound)
```

## 3C — Silent Enrichment Pipeline

```mermaid
flowchart LR
    subgraph SOURCES
        SM[Social Media\nLinkedIn · Instagram]
        MEET[Meeting Audio\nRecorded offline]
        FD[Freshdesk Tickets]
        WA[WhatsApp History]
    end

    subgraph ENRICHMENT
        APIFY[Apify Scraper\nDaily cron]
        PROXY[Proxycurl\nLinkedIn enrichment]
        WHISPER[Whisper\nAWS GPU Spot]
        FDPARSE[Ticket Parser]
        WAPARSE[Thread Parser]
    end

    subgraph EMBEDDING
        JINA[Jina v3 API\nText → 1024-dim vectors]
        CHUNK[Chunker\n512 token windows]
    end

    subgraph VAULT
        PG[(PostgreSQL\nclient profiles)]
        VEC[(pgvector\nembedding index)]
    end

    SM --> APIFY
    SM --> PROXY
    MEET --> WHISPER
    FD --> FDPARSE
    WA --> WAPARSE
    APIFY --> CHUNK
    PROXY --> CHUNK
    WHISPER --> CHUNK
    FDPARSE --> CHUNK
    WAPARSE --> CHUNK
    CHUNK --> JINA
    JINA --> VEC
    JINA --> PG
```

---

# 4. Elia Intelligence Flows

## 4A — Auto-Context: Agent Opens a Lead (Planned — Chrome Extension)

```mermaid
sequenceDiagram
    participant AGENT as Agent Browser
    participant EXT as Chrome Extension / Floating UI
    participant GEM as Gemini Flash
    participant CTXAPI as Atlas Context API
    participant REDIS as Upstash Redis Cache
    participant VEC as pgvector
    participant PG as PostgreSQL
    participant CLAUDE as Claude 4.6

    AGENT->>EXT: Navigates to /leads/{id}
    EXT->>GEM: DOM snapshot
    GEM->>GEM: Extract lead_id from DOM
    GEM->>CTXAPI: GET /api/elia/context?lead_id=X
    CTXAPI->>REDIS: Cache key lookup
    alt Cache Hit
        REDIS-->>EXT: Return cached context (instant)
    else Cache Miss
        CTXAPI->>PG: Fetch lead, tasks, timeline, WhatsApp last N messages
        CTXAPI->>VEC: Semantic search: client preference history
        PG-->>CTXAPI: Raw data
        VEC-->>CTXAPI: Top-K relevant embeddings
        CTXAPI->>CLAUDE: Synthesize into structured client profile
        CLAUDE-->>CTXAPI: Structured context JSON
        CTXAPI->>REDIS: Cache (TTL: 5 min)
        CTXAPI-->>EXT: Return context
    end
    EXT->>AGENT: Render context panel (< 2 seconds)
```

## 4B — Live Vendor Auditing (Planned)

```mermaid
sequenceDiagram
    participant AGENT as Agent Browser
    participant EXT as Chrome Extension
    participant GEM as Gemini Flash (background)
    participant CTXAPI as Context API
    participant CLAUDE as Claude 4.6
    participant EXT2 as Extension UI

    AGENT->>EXT: Navigates to vendor site (yacht/hotel/aviation)
    EXT->>GEM: Stream DOM changes (continuous, cheap)
    GEM->>GEM: Extract: price, destination, dates, capacity, exclusions
    GEM->>CTXAPI: POST /api/elia/audit {vendor_data, lead_id}
    CTXAPI->>CTXAPI: Load client constraints from cache
    CTXAPI->>CLAUDE: Compare vendor_data vs client profile
    CLAUDE-->>CTXAPI: Conflict report {flags[], severity, explanation}
    CTXAPI-->>EXT2: Push conflict alerts
    EXT2->>AGENT: Show flags in sidebar panel
    note over AGENT,EXT2: Agent continues browsing — Elia updates silently
```

## 4C — Agentic Workflow Orchestration (Planned)

## 4D — WhatsApp Profile Analysis (Shipped — Atlas)

See **§0B** for the canonical sequence diagram. Summary:

1. **Ingest** — Chetto Joule `GET /v1/groups/{id}/timeline` (via `getGroupTimeline` in `lib/actions/chetto.ts`), not browser `/api/chetto/*`.
2. **Classify** — Client vs staff by matching message `phone_no` to `clients.phone_number` using `e164LookupVariants` (Indian number variants).
3. **Analyse** — Haiku with `buildWhatsAppProfilePrompt` → full `EliaProfile` JSON (merge with existing).
4. **Persist** — Service role UPDATE on `client_profiles`; track `elia_messages_through` for incremental runs.
5. **Display** — Profile tab **Elia Intelligence**: button + inline summary, sentiment, travel, recent requests (no modal).

**Auth:** Manual trigger requires `admin`, `founder`, `super_admin`, or `manager` (`triggerEliaWhatsAppAnalysis`).

```mermaid
flowchart TD
    AGENT([Agent types natural language request]) --> ELIA[Elia receives input]
    ELIA --> HAIKU[Claude Haiku\nIntent classification]
    HAIKU --> CLAUDE[Claude 4.6 Sonnet\nWorkflow generation]
    CLAUDE --> PLAN[Structured Workflow Plan\nJSON with subtasks + departments]

    PLAN --> REVIEW{Agent reviews plan}
    REVIEW -->|Edits| CLAUDE
    REVIEW -->|Approves — 1 tap| EXECUTE

    EXECUTE[Execute via Atlas Server Actions]
    EXECUTE --> MASTER[Create Master Task\nin tasks table]
    MASTER --> G1[Concierge Sub-task\nassigned to concierge agent]
    MASTER --> G2[Shop Sub-task\nassigned to shop agent]
    MASTER --> G3[Finance Sub-task\nassigned to finance team]
    MASTER --> G4[Legacy Sub-task\nlogged in client record]

    G1 --> REALTIME[Supabase Realtime\nbroadcasts to assigned agents]
    G2 --> REALTIME
    G3 --> REALTIME
    G4 --> REALTIME
    REALTIME --> NOTIFY[In-app task_notifications]
    REALTIME --> ATLAS_UI[Atlas Task Board updates live]

    G1 --> AUDIT[lead_activities\nimmutable append-only log]
    G2 --> AUDIT
    G3 --> AUDIT
    G4 --> AUDIT
```

---

# 5. The Security Boundary

```mermaid
flowchart TD
    subgraph EXTERNAL [" Untrusted Zone "]
        EXT_REQ[Incoming Webhook Request]
        EXT_AGENT[Agent Browser]
    end

    subgraph EDGE [" Edge / API Layer "]
        MW[Next.js Middleware - proxy.ts via middleware.ts - Session refresh + auth redirect]
        RATE[Upstash Rate Limiter - Fail-closed - no env = 429]
        BEARER[Bearer Secret Verify - timing-safe comparison]
        HMAC[HMAC-SHA256 Verify - WhatsApp only]
    end

    subgraph APP [" Application Layer "]
        RSC[RSC Layout Auth Gate - dashboard layout]
        SA[Server Action - getAuthUser]
        ZOD[Zod Schema Validation]
        SANITIZE[sanitizeText + normalizeToE164]
    end

    subgraph DB [" Database Layer "]
        RLS[PostgreSQL RLS]
        DEFINER[SECURITY DEFINER functions - get_user_role - get_user_domain - get_user_department]
        PROFILES[(profiles table - SOLE auth source - never JWT)]
        AUDIT[(lead_activities - Append-only - No UPDATE or DELETE ever)]
    end

    EXT_REQ --> RATE
    RATE --> BEARER
    BEARER --> HMAC
    HMAC --> ZOD
    ZOD --> SANITIZE
    SANITIZE --> DB

    EXT_AGENT --> MW
    MW --> RSC
    RSC --> SA
    SA --> ZOD
    ZOD --> SANITIZE
    SANITIZE --> RLS
    RLS --> DEFINER
    DEFINER --> PROFILES
    PROFILES --> AUDIT
```

> [!IMPORTANT]
> 

> `get_user_role()`, `get_user_domain()`, and `get_user_department()` read **only from `public.profiles`**. JWT claims are never trusted for authorization. This is a load-bearing invariant — it must never change.
> 

---

# 6. Data Model Relationships

```mermaid
erDiagram
    clients ||--o| client_profiles : "client_id UNIQUE"
    client_profiles {
        uuid id PK
        uuid client_id FK
        jsonb elia_profile
        int elia_version
        timestamptz elia_analyzed_at
        text elia_messages_through
    }
    clients {
        uuid id PK
        text phone_number
        text chetto_group_id
    }

    profiles ||--o{ leads : "assigned_to"
    profiles ||--o{ tasks : "assigned_to"
    profiles ||--o{ lead_activities : "actor_id"
    profiles ||--o{ task_remarks : "author_id"
    profiles ||--o{ project_members : "user_id"
    profiles }o--|| profiles : "reports_to"

    leads ||--o{ whatsapp_messages : "lead_id"
    leads ||--o{ lead_activities : "lead_id"
    leads ||--o{ tasks : "lead_id"

    projects ||--o{ project_members : "project_id"
    projects ||--o{ task_groups : "project_id"
    task_groups ||--o{ tasks : "group_id"

    tasks ||--o{ tasks : "parent_task_id (subtask)"
    tasks ||--o{ task_remarks : "task_id"
    tasks ||--o{ task_progress_updates : "task_id"
    tasks ||--o{ task_notifications : "task_id"
    tasks }o--|| import_batches : "import_batch_id"

    campaign_metrics }o--|| profiles : "synced_by"
    agent_routing_config }o--|| profiles : "agent_id"
```

---

# 7. Access Control Model

```mermaid
flowchart LR
    subgraph USER [" User Profile "]
        ROLE[role\nadmin · founder · manager · agent · guest]
        DOMAIN[domain\nconcierge · shop · house · legacy · global]
        DEPT[department\nconcierge · finance · tech · shop · house · legacy · marketing · onboarding]
    end

    subgraph CONTROLS [" Two Access Axes "]
        DATA_AXIS[Data Axis\nWhat rows you can read/write]
        UI_AXIS[UI Axis\nWhat screens you can open]
    end

    subgraph ENFORCEMENT
        RLS[PostgreSQL RLS\nper-table policies]
        ROUTE_MAP[DEPARTMENT_ROUTE_ACCESS\nlib/constants/departments.ts]
        SIDEBAR[Sidebar\nfilters nav based on dept]
    end

    DOMAIN --> DATA_AXIS
    ROLE --> DATA_AXIS
    DEPT --> UI_AXIS

    DATA_AXIS --> RLS
    UI_AXIS --> ROUTE_MAP
    ROUTE_MAP --> SIDEBAR
```

**Special Cases:**

| Domain | Who | Data Scope |
| --- | --- | --- |
| `indulge_global` | Finance, Tech, Marketing | SELECT across ALL domains |
| `indulge_concierge` | Concierge agents | Concierge rows only |
| `indulge_shop` | Shop agents | Shop rows only |
| `indulge_house` | House agents | House rows only |
| `indulge_legacy` | Legacy agents | Legacy rows only |

> [!NOTE]
> 

> `indulge_global` grants cross-domain READ. It does not grant WRITE across domains. `pick_next_agent_for_domain()` normalises `indulge_global` → `indulge_concierge` for lead assignment — Finance/Tech staff are never assigned leads.
> 

---

# 8. Chrome Extension Architecture

```mermaid
flowchart TD
    subgraph BROWSER [" Agent Chrome Browser "]
        TABS[Active Tab - Atlas lead or vendor site]
        EXT_BG[Extension Background Service Worker]
        EXT_UI[Extension Sidebar Panel]
        DOM[Page DOM]
    end

    subgraph GEM_LAYER [" Gemini Flash Layer "]
        GEM_API[Gemini 3.1 Flash - Continuous DOM scan]
        EXTRACT[Entity Extractor - lead id + prices + dates + destinations]
    end

    subgraph ATLAS_API [" Atlas API - Next.js "]
        CTX_ROUTE[Elia Context Endpoint]
        AUDIT_ROUTE[Elia Audit Endpoint]
        WORKFLOW_ROUTE[Elia Workflow Endpoint]
    end

    subgraph ELIA_BRAIN [" Intelligence "]
        REDIS_CACHE[Upstash Redis Cache]
        CLAUDE_R[Claude 4.6 Sonnet]
    end

    TABS --> DOM
    DOM --> EXT_BG
    EXT_BG --> GEM_API
    GEM_API --> EXTRACT
    EXTRACT -->|Atlas page| CTX_ROUTE
    EXTRACT -->|Vendor page| AUDIT_ROUTE
    CTX_ROUTE --> REDIS_CACHE
    REDIS_CACHE -->|miss| CLAUDE_R
    CLAUDE_R --> CTX_ROUTE
    REDIS_CACHE -->|hit| EXT_UI
    CTX_ROUTE --> EXT_UI
    AUDIT_ROUTE --> CLAUDE_R
    CLAUDE_R --> AUDIT_ROUTE
    AUDIT_ROUTE --> EXT_UI
    EXT_UI --> TABS
    EXT_UI -->|Agent approves| WORKFLOW_ROUTE
    WORKFLOW_ROUTE --> ATLAS_API
```

---

# 9. Realtime Architecture

Elia and Atlas use **Supabase Realtime** for live updates — no polling, no WebSockets server to manage.

```mermaid
flowchart LR
    subgraph DB [" Supabase "]
        PG[(PostgreSQL)]
        RT[Realtime Publication\nREPLICA IDENTITY FULL]
    end

    subgraph CHANNELS [" Channels "]
        TASK_CH[tasks channel]
        REMARKS_CH[task_remarks channel]
        GROUPS_CH[task_groups channel]
        LEAD_CH[leads channel]
        MSG_CH[whatsapp_messages channel]
    end

    subgraph HOOKS [" Client Hooks "]
        ATLAS_TASK[useAtlasTaskRealtime]
        TASK_RT[useTaskRealtime]
        INTEL_RT[useTaskIntelligenceRealtime]
        MSGS_RT[useMessages]
        SLA_RT[useSLA_Monitor\n60s poll fallback]
    end

    subgraph UI [" Agent UI Updates "]
        BOARD[Task Board]
        REMARKS[Task Remarks Timeline]
        CHAT[WhatsApp Chat Panel]
        ALERTS[SLA Breach Alerts]
        NOTIF[In-app Notifications]
    end

    PG -->|Row change| RT
    RT --> TASK_CH
    RT --> REMARKS_CH
    RT --> GROUPS_CH
    RT --> LEAD_CH
    RT --> MSG_CH
    TASK_CH --> ATLAS_TASK
    TASK_CH --> TASK_RT
    REMARKS_CH --> TASK_RT
    GROUPS_CH --> TASK_RT
    TASK_CH --> INTEL_RT
    MSG_CH --> MSGS_RT
    LEAD_CH --> SLA_RT
    ATLAS_TASK --> BOARD
    TASK_RT --> REMARKS
    MSGS_RT --> CHAT
    SLA_RT --> ALERTS
    INTEL_RT --> NOTIF
```

---

# 10. Cost & Request Flow — The Economics

```mermaid
flowchart TD
    REQ([Agent opens lead / browses vendor]) --> GEM
    GEM[Gemini Flash DOM scan ~$0.0001 per page] --> Q{Context already cached?}
    Q -->|Yes — Cache Hit 40%+ of requests| REDIS[Upstash Redis return instantly — $0 AI cost]
    Q -->|No — Cache Miss| VEC_SEARCH[pgvector semantic search \ free within Supabase]
    VEC_SEARCH --> SIMPLE{Simple\retrieval?}
    SIMPLE -->|Yes| HAIKU[Claude Haiku ~$0.00025/1K tokens]
    SIMPLE -->|No — reasoning needed| SONNET[Claude 4.6 Sonnet ~$0.003/1K tokens]
    HAIKU --> REDIS_WRITE[Write to Redis cache]
    SONNET --> REDIS_WRITE
    REDIS_WRITE --> AGENT_UI[Agent sees context]
    REDIS --> AGENT_UI
```

**Cost control summary:**

- Gemini Flash runs always — it is the cheapest possible perception layer
- Redis cache absorbs ~40%+ of Claude calls entirely
- Haiku handles fast intent classification — Sonnet activates only for complex reasoning
- pgvector is free — no external vector DB bill

---

# 11. Deployment Architecture

```mermaid
flowchart TD
    subgraph GH [" GitHub "]
        REPO[Indulge Atlas]
        CI[GitHub Actions + vitest on every push to main]
    end

    subgraph VERCEL [" Vercel "]
        NEXT[Next.js 16 App\nServer Components + Actions + API Routes]
        MW[middleware.ts\nSession refresh + auth gate\n⚠️ Not wired yet]
    end

    subgraph SUP [" Supabase Cloud "]
        PG2[(PostgreSQL 15)]
        AUTH[Auth Service + JWT cookies]
        RT2[Realtime Service]
        STORE[Storage]
    end

    subgraph AWS [" AWS "]
        KMS[KMS — encryption at rest]
        WAF[WAF — firewall]
        EKS[EKS + EC2 — Elia API servers]
        GPU[EC2 g5.xlarge Spot \ Whisper transcription]
        S3[S3 + CDN \ file storage]
    end

    subgraph EXTERNAL [" External APIs "]
        META_API[Meta Cloud API \ WhatsApp]
        PAB2[Pabbly Connect\ middleware]
        UPSTASH[Upstash Redis]
        JINA2[Jina v3 Embeddings]
        APIFY2[Apify + Proxycurl]
        ELEVEN[ElevenLabs TTS]
        SENTRY[Sentry\ Error monitoring + tracing]
    end

    REPO -->|Push to main| CI
    CI -->|Pass| VERCEL
    VERCEL --> SUP
    VERCEL --> UPSTASH
    VERCEL --> SENTRY
    SUP --> KMS
    EKS --> PG2
    EKS --> JINA2
    EKS --> APIFY2
    GPU --> S3
    VERCEL --> META_API
    PAB2 --> VERCEL
    EKS --> ELEVEN
    WAF --> EKS
```

> [!IMPORTANT]
> 

> **Critical gap**: `middleware.ts` does not exist at the Next.js root. `proxy.ts` contains the implementation but is never loaded. Session refresh and edge-level auth gate are non-functional until `middleware.ts` is created with `export { proxy as middleware, config } from "./proxy"`.
> 

---

# 12. Key Architectural Rules

These are non-negotiable. Changing any requires a full architecture review.

| # | Rule |
| --- | --- |
| 1 | `get_user_role()`, `get_user_domain()`, `get_user_department()` read **only from `public.profiles`**. JWT claims never trusted for authorization. |
| 2 | All SECURITY DEFINER functions have `SET search_path = public`. |
| 3 | `lead_activities` and `task_progress_updates` are append-only. No UPDATE or DELETE. Ever. |
| 4 | `components/ui/` is zero-dependency — no imports from `lib/actions/` or feature code. |
| 5 | Server Actions are the **only** entry point from components to DB mutations. |
| 6 | All user-supplied text fields pass through `sanitizeText()` before any DB write. |
| 7 | Phone numbers stored in E.164. `normalizeToE164()` on every phone field before insert. |
| 8 | `pg_advisory_xact_lock` on `pick_next_agent_for_domain()` must never be removed. |
| 9 | Every new table must have RLS enabled. |
| 10 | Elia never sends raw UHNI PII to Claude or Gemini APIs. Data is pseudonymized before leaving the vault. |
| 11 | All Elia agentic actions require explicit agent approval before execution. Elia proposes — agents decide. |