-- Migration 136: Academy — allow PDF documents as chat attachments.
--
-- Standalone apply file. Identical to
-- `supabase/migrations/136_academy_pdf_attachments.sql`; kept here so it can be
-- pasted straight into the SQL editor like the other Academy parts.
--
-- WHY THIS EXISTS
--   Part 5 (migration 127) created the private `academy-attachments` bucket with
--   allowed_mime_types = ARRAY['image/*', 'video/*'].
--
--   Storage matches an upload's DECLARED content type against that list and
--   refuses anything else at the storage API, after every application-layer
--   check has already passed. So a PDF that survived the composer, the server
--   action and RLS still died here, with an error the UI surfaced only as
--   "could not be uploaded".
--
-- SCOPE
--   The allow-list only. The bucket stays PRIVATE, keeps its 50MB ceiling, and
--   keeps the object policies from part 5 (SELECT + INSERT for authenticated
--   users scoped to their own session folder; no UPDATE/DELETE, because a
--   shared attachment is part of the graded transcript). Per-kind caps stay in
--   the server action: 10MB image / 50MB video / 20MB document.
--
--   PDF only, not 'application/*'. A wildcard here would let any binary into a
--   bucket whose contents are rendered back to users.
--
-- APPEND-ONLY IS PRESERVED — no change to training_turns rows; `attachments`
-- simply gains a third `kind` value ('document'), written at INSERT time.
--
-- IDEMPOTENT: safe to re-run.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'academy-attachments',
  'academy-attachments',
  false,
  52428800,  -- 50 MB ceiling (video); tighter per-type caps enforced in the action
  ARRAY['image/*', 'video/*', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMENT ON COLUMN public.training_turns.attachments IS
  'Array of {path, kind, mime, name, size} for images/videos/PDFs shared in this turn. kind is one of image | video | document. Written at INSERT only — training_turns is append-only.';

-- Verify: expect public=false, 52428800, {image/*,video/*,application/pdf}
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'academy-attachments';
