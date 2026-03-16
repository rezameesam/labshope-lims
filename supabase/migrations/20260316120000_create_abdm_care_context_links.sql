-- Care context links: tracks each HIP-initiated link of a test/invoice record
-- to a patient's ABHA address via the ABDM gateway.

CREATE TABLE IF NOT EXISTS public.abdm_care_context_links (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lab_id                 UUID REFERENCES public.labs(id) ON DELETE SET NULL,
  patient_id             UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  patient_test_id        UUID REFERENCES public.patient_tests(id) ON DELETE SET NULL,
  invoice_id             UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  abha_address           TEXT NOT NULL,
  care_context_reference TEXT NOT NULL,
  care_context_display   TEXT NOT NULL,
  hi_type                TEXT NOT NULL DEFAULT 'DiagnosticReport'
    CHECK (hi_type IN ('DiagnosticReport', 'OPConsultation', 'Prescription', 'WellnessRecord')),
  link_status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (link_status IN ('pending', 'linked', 'notified', 'failed')),
  link_token             TEXT,
  abdm_request_id        UUID,
  abdm_response          JSONB,
  link_attempted_at      TIMESTAMPTZ,
  notify_attempted_at    TIMESTAMPTZ,
  error_message          TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX idx_abdm_ccl_org         ON public.abdm_care_context_links(organization_id);
CREATE INDEX idx_abdm_ccl_patient      ON public.abdm_care_context_links(patient_id);
CREATE INDEX idx_abdm_ccl_patient_test ON public.abdm_care_context_links(patient_test_id);
CREATE INDEX idx_abdm_ccl_status       ON public.abdm_care_context_links(organization_id, link_status);

ALTER TABLE public.abdm_care_context_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organization staff can manage care context links"
  ON public.abdm_care_context_links
  FOR ALL
  USING (public.user_has_organization_access(auth.uid(), organization_id));
