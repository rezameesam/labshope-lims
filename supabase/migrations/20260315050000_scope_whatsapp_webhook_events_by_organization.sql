ALTER TABLE public.whatsapp_webhook_events
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_events_organization_id
  ON public.whatsapp_webhook_events(organization_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_events_message_org
  ON public.whatsapp_webhook_events(message_id, organization_id);

DROP POLICY IF EXISTS "Admins can view whatsapp webhook events" ON public.whatsapp_webhook_events;
CREATE POLICY "Admins can view whatsapp webhook events by organization"
ON public.whatsapp_webhook_events
FOR SELECT
USING (
  organization_id IS NOT NULL
  AND public.user_has_organization_access(auth.uid(), organization_id)
);
