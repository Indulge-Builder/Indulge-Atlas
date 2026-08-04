-- Migration 135: let the Academy attachment bucket accept PDFs.
--
-- Migration 127 created `academy-attachments` with a MIME allowlist covering
-- images and video only. That allowlist is the real gate: without this, a PDF
-- is rejected by storage no matter what the composer, the upload action or the
-- route permit, and the trainee sees a generic upload failure.
--
-- A fresh migration rather than an edit to 127 — 127 has already run, and
-- re-running it is not the same thing as amending it.
--
-- Scope is deliberately PDF only. A broad document allowlist would let arbitrary
-- binaries into a bucket whose contents are served back to trainees over signed
-- URLs.
--
-- MIGRATION NUMBER: 135 is the next free number in the repo listing, but this
-- repo has had collisions — VERIFY against the live database before applying.

BEGIN;

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/quicktime',
      'video/webm',
      'application/pdf'
    ]
WHERE id = 'academy-attachments';

-- Fail loudly rather than silently doing nothing if the bucket is absent or the
-- update did not take: a silent no-op here surfaces later as an unexplained
-- upload failure in the UI, which is exactly what this migration exists to fix.
DO $$
DECLARE
  allowed text[];
BEGIN
  SELECT allowed_mime_types INTO allowed
  FROM storage.buckets
  WHERE id = 'academy-attachments';

  IF allowed IS NULL THEN
    RAISE EXCEPTION
      'Bucket academy-attachments not found, or it has no MIME allowlist. Migration 127 may not have been applied. Nothing was committed.';
  END IF;

  IF NOT ('application/pdf' = ANY (allowed)) THEN
    RAISE EXCEPTION
      'application/pdf is still not in the academy-attachments allowlist. Nothing was committed.';
  END IF;
END $$;

COMMIT;
