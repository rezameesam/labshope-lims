-- Expand abdm_scan_logs.request_type to cover enrollment and care context events.

ALTER TABLE public.abdm_scan_logs
  DROP CONSTRAINT IF EXISTS abdm_scan_logs_request_type_check;

ALTER TABLE public.abdm_scan_logs
  ADD CONSTRAINT abdm_scan_logs_request_type_check
  CHECK (request_type IN (
    'scan_share_lookup',
    'profile_share_callback',
    'session_preflight',
    'abha_enrollment_otp',
    'abha_enrollment_verify',
    'abha_enrollment_suggestions',
    'abha_enrollment_set_address',
    'care_context_token',
    'care_context_link',
    'care_context_notify',
    'running_token_callback'
  ));
