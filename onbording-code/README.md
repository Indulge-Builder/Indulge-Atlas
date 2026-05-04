# Onboarding / CRM journey — code snapshot

This folder is a **read-only duplicate** of Atlas source files that implement the lead journey (webhooks → ingestion → `leads` → list → dossier → tasks / WhatsApp / chat / dashboard), plus supporting UI (`components/ui`), server actions, and Supabase helpers.

**Not included:** `node_modules`, `app` routes outside this slice, most of `components` (e.g. manager, projects, elia), env files, migrations. Files still use `@/` imports pointing at the main app — this tree is **not** a standalone build; it is for review, search, or handing to another tool.

**Source of truth:** the real files under `/Users/alam/Desktop/Indulge-Atlas` (repo root).

**Doc:** see `../onboarding_workflow.md` (section 15 — journey inventory).

Generated: 2026-05-04
