-- 122_employee_department_watcher.sql
-- Adds the 'watcher' department. A Watcher oversees one or more Queendoms with
-- READ-ONLY (admin-style) access to those Queendoms' tickets — they are NOT ticket
-- actors (no create/assign/move/resolve).
--
-- This is its OWN migration on purpose: Postgres cannot use a newly-added enum value
-- in the same transaction that adds it. Migration 123 (mapping table + RLS that
-- reference 'watcher') MUST be applied AFTER this one has committed.

ALTER TYPE public.employee_department ADD VALUE IF NOT EXISTS 'watcher';
