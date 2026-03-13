-- ============================================================
-- Indulge Global CRM — Manager Task Types + Nullable lead_id
-- ============================================================

-- Expand task_type enum with strategic manager tasks
alter type public.task_type add value if not exists 'campaign_review';
alter type public.task_type add value if not exists 'strategy_meeting';
alter type public.task_type add value if not exists 'budget_approval';
alter type public.task_type add value if not exists 'performance_analysis';

-- Make lead_id nullable so manager-level tasks don't require a lead
alter table public.tasks alter column lead_id drop not null;
