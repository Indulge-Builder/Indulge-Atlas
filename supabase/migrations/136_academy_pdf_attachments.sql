-- Migration 136: Academy — allow PDF documents as chat attachments.
--
-- WHY THIS EXISTS
--   Migration 127 created the private `academy-attachments` bucket with
--   allowed_mime_types = ARRAY['image/*', 'video/*'].
--
--   Storage matches an upload's DECLARED content type against that list and
--   refuses anything else at the storage API, after every application-layer
--   check has already passed. So a PDF that survived the composer, the server
--   action and RLS still died here, with an error the UI surfaced only as
--   "could not be uploaded".
--
--   Interns share itineraries, quotes and proposals as PDFs — the same way the
--   real concierge desk does — so the drill has to carry them.
--
-- SCOPE
--   The allow-list only. Nothing else about the bucket changes: it stays
--   PRIVATE, keeps its 50MB ceiling, and keeps the object policies from 127
--   (SELECT + INSERT for authenticated users scoped to their own session
--   folder; no UPDATE/DELETE, because a shared attachment is part of the
--   graded transcript). Per-kind caps stay in the server action, which is
--   stricter than the bucket: 10MB image / 50MB video / 20MB document.
--
--   PDF only, not 'application/*'. A wildcard here would let any binary into a
--   bucket whose contents are rendered back to users.
--
-- APPEND-ONLY IS PRESERVED
--   No change to training_turns. `attachments` already stores {path, kind,
--   mime, name, size} and gains a third `kind` value ('document') written at
--   INSERT time like the other two. No existing row is rewritten.
--
-- MIGRATION NUMBER
--   136 is the next free number in the repo listing, but this repo has had
--   numbering collisions and several unapplied migrations. VERIFY against the
--   live database before applying.
--
-- IDEMPOTENT: safe to re-run.

-- Update in place when the bucket already exists (the normal case: 127 is
-- applied), create it correctly when it does not.
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

-- Verification (run manually; should return the three-entry allow-list):
--   SELECT id, public, file_size_limit, allowed_mime_types
--   FROM storage.buckets WHERE id = 'academy-attachments';
