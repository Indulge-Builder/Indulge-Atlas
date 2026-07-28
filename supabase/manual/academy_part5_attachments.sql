-- ===========================================================================
-- ACADEMY PART 5 - chat attachments (images + video)
-- ===========================================================================
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query.
--   Paste, then press Ctrl+A to be sure NOTHING is partially selected, Run.
--   (The SQL editor executes only the highlighted text when a selection
--    exists - a half-selected string literal produces confusing errors
--    like `relation "our" does not exist`.)
--
--   Run AFTER parts 1-3 (needs training_turns + can_access_academy_session).
--   Adds training_turns.attachments, a PRIVATE academy-attachments bucket,
--   and object RLS. Safe to re-run.
--
--   Append-only is preserved: adding a COLUMN is a schema change, not a row
--   mutation. training_turns still has SELECT + INSERT policies only.
--
-- Source: supabase/migrations/127_academy_attachments.sql
-- Generated 2026-07-27
-- ===========================================================================

-- Migration 127: Academy — chat attachments (images + video).
--
-- Interns can share a photo or a short video with the simulated client, the way
-- a real concierge sends a venue photo or a walkthrough clip on WhatsApp.
--
-- Two pieces:
--   1. training_turns.attachments jsonb  — metadata array on the (append-only) turn
--   2. a PRIVATE `academy-attachments` storage bucket + object RLS
--
-- APPEND-ONLY IS PRESERVED. Adding a COLUMN is a schema change, not a row
-- mutation: training_turns still has SELECT + INSERT policies only, so an
-- existing turn can never be rewritten. Attachments are supplied at INSERT time.
--
-- attachments shape (array, default []):
--   [{ "path": "academy/<session_id>/<uuid>-name.jpg",
--      "kind": "image" | "video",
--      "mime": "image/jpeg",
--      "name": "venue.jpg",
--      "size": 123456 }]
--
-- Path convention: academy/{session_id}/{uuid}-{filename}
--   foldername(name) = {'academy', '<session_id>'}
-- so object RLS can reuse can_access_academy_session() directly.
--
-- Bucket is PRIVATE. Uploads and reads flow through server actions (service role)
-- + short-lived signed URLs; the policies below are defence-in-depth.
--
-- IDEMPOTENT: safe to re-run.

-- ── 1. attachments column ────────────────────────────────────────────────────

ALTER TABLE public.training_turns
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.training_turns.attachments IS
  'Array of {path, kind, mime, name, size} for images/videos shared in this turn. Written at INSERT only — training_turns is append-only.';

-- Only index turns that actually carry media (most do not).
CREATE INDEX IF NOT EXISTS idx_training_turns_with_attachments
  ON public.training_turns (session_id)
  WHERE jsonb_array_length(attachments) > 0;

-- ── 2. private storage bucket ────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'academy-attachments',
  'academy-attachments',
  false,
  52428800,  -- 50 MB ceiling (video); tighter per-type caps enforced in the action
  ARRAY['image/*', 'video/*']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 3. object RLS ────────────────────────────────────────────────────────────
-- Guard the [2] segment with a UUID-shape regex BEFORE casting, so a malformed
-- path can never raise inside the policy predicate (same guard as migration 109).

DROP POLICY IF EXISTS "academy_attachments_read" ON storage.objects;
CREATE POLICY "academy_attachments_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'academy-attachments'
    AND (storage.foldername(name))[1] = 'academy'
    AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.can_access_academy_session(((storage.foldername(name))[2])::uuid)
  );

DROP POLICY IF EXISTS "academy_attachments_insert" ON storage.objects;
CREATE POLICY "academy_attachments_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'academy-attachments'
    AND (storage.foldername(name))[1] = 'academy'
    AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.can_access_academy_session(((storage.foldername(name))[2])::uuid)
  );

-- No UPDATE/DELETE policy for authenticated users: a shared attachment is part
-- of the transcript and must not be swapped or removed after the fact. Cleanup
-- (if ever needed) goes through the service role.
