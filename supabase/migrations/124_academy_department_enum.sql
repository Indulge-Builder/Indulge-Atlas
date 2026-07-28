-- Migration 124: Academy — add the `academy` department enum value.
--
-- Academy is the intern training simulator. "Trainers" (who read every session
-- and author the scenario seed library) are identified by department='academy'
-- OR a privileged role (admin/founder/super_admin) — see migration 121's
-- `is_academy_trainer()` helper.
--
-- This MUST be its own migration: PostgreSQL forbids using a newly added enum
-- value in the same transaction that adds it, and migration 125 defines
-- functions/policies that reference 'academy'. Adding the value here (a separate,
-- committed migration) guarantees it exists before 125 runs.
-- (Same pattern as 122_employee_department_watcher.sql.)

ALTER TYPE public.employee_department ADD VALUE IF NOT EXISTS 'academy';
