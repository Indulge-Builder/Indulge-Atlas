-- Migration 109: Concierge ticketing — private Storage bucket + object RLS.
--
-- FIRST use of Supabase Storage in this repo. Bucket is PRIVATE; all uploads and
-- downloads flow through server actions (service role) + short-lived signed URLs.
-- The object-level policies below are defense-in-depth: even a direct authenticated
-- client request can only touch objects for a ticket it may view/edit.
--
-- Path convention: concierge/{ticket_id}/{uuid}-{filename}
--   foldername(name) = {'concierge', '<ticket_id>'}
--
-- Per-type size caps (25MB image/pdf, 200MB video) are enforced in the upload
-- action; the bucket carries the coarse 200MB ceiling + allowed mime wildcards.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ticket-attachments',
  'ticket-attachments',
  false,
  209715200,  -- 200 MB hard ceiling (video); finer per-type caps enforced in-app
  ARRAY['image/*', 'application/pdf', 'video/*']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- storage.objects already has RLS enabled by Supabase; add scoped policies.
-- Guard the [2] path segment with a UUID-shape regex BEFORE casting to uuid so a
-- malformed path can never raise inside the policy predicate.

DROP POLICY IF EXISTS "ticket_attachments_read" ON storage.objects;
CREATE POLICY "ticket_attachments_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ticket-attachments'
    AND (storage.foldername(name))[1] = 'concierge'
    AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.can_view_concierge_ticket(((storage.foldername(name))[2])::uuid)
  );

DROP POLICY IF EXISTS "ticket_attachments_insert" ON storage.objects;
CREATE POLICY "ticket_attachments_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ticket-attachments'
    AND (storage.foldername(name))[1] = 'concierge'
    AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.can_edit_concierge_ticket(((storage.foldername(name))[2])::uuid)
  );

DROP POLICY IF EXISTS "ticket_attachments_update" ON storage.objects;
CREATE POLICY "ticket_attachments_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'ticket-attachments'
    AND (storage.foldername(name))[1] = 'concierge'
    AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.can_edit_concierge_ticket(((storage.foldername(name))[2])::uuid)
  );

DROP POLICY IF EXISTS "ticket_attachments_delete" ON storage.objects;
CREATE POLICY "ticket_attachments_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'ticket-attachments'
    AND (storage.foldername(name))[1] = 'concierge'
    AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.can_edit_concierge_ticket(((storage.foldername(name))[2])::uuid)
  );
