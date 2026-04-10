-- =============================================================================
-- INDULGE ATLAS — WhatsApp Cloud API message history (per lead)
-- =============================================================================
-- Note: 054 is used by upgrade_tasks_for_shop; this is 055.
-- =============================================================================

CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type text NOT NULL CHECK (message_type IN ('text', 'template', 'image')),
  content text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  wa_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX whatsapp_messages_lead_id_created_at_idx
  ON public.whatsapp_messages (lead_id, created_at ASC);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Align visibility with leads (domain isolation for agents; scout/admin/finance see all)
CREATE POLICY "whatsapp_messages_select" ON public.whatsapp_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = whatsapp_messages.lead_id
        AND (
          public.get_role_from_jwt() IN ('scout', 'admin', 'finance')
          OR (
            l.assigned_to = auth.uid()
            AND l.domain = public.get_my_domain()
          )
        )
    )
  );

CREATE POLICY "whatsapp_messages_insert" ON public.whatsapp_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = whatsapp_messages.lead_id
        AND (
          public.get_role_from_jwt() IN ('scout', 'admin', 'finance')
          OR (
            l.assigned_to = auth.uid()
            AND l.domain = public.get_my_domain()
          )
        )
    )
  );

COMMENT ON TABLE public.whatsapp_messages IS
  'WhatsApp Cloud API chat history; outbound from CRM, inbound from webhooks/sync.';
