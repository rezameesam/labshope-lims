ALTER TABLE public.abdm_scan_logs
  DROP CONSTRAINT IF EXISTS abdm_scan_logs_request_type_check;

ALTER TABLE public.abdm_scan_logs
  ADD CONSTRAINT abdm_scan_logs_request_type_check
  CHECK (request_type IN ('scan_share_lookup', 'profile_share_callback'));
