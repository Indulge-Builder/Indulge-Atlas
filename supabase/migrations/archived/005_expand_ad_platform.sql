-- ============================================================
-- Indulge Global CRM — Expand ad_platform enum
-- ============================================================

alter type public.ad_platform add value if not exists 'website';
alter type public.ad_platform add value if not exists 'events';
alter type public.ad_platform add value if not exists 'referral';
