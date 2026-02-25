-- Prevent revoked sessions from being revived by heartbeat updates.

CREATE OR REPLACE FUNCTION public.upsert_employee_session(
  _session_id UUID,
  _device_name TEXT DEFAULT NULL,
  _browser TEXT DEFAULT NULL,
  _os TEXT DEFAULT NULL,
  _location TEXT DEFAULT NULL,
  _ip TEXT DEFAULT NULL,
  _user_agent TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  request_headers JSONB;
  detected_ip TEXT;
  existing_revoked_at TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'employee'::app_role)
    OR public.has_role(auth.uid(), 'collector'::app_role)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- If auth session no longer exists, this token should be treated as inactive.
  IF NOT EXISTS (
    SELECT 1
    FROM auth.sessions s
    WHERE s.id = _session_id
      AND s.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Session inactive';
  END IF;

  SELECT es.revoked_at
    INTO existing_revoked_at
  FROM public.employee_sessions es
  WHERE es.user_id = auth.uid()
    AND es.session_id = _session_id;

  IF existing_revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Session revoked';
  END IF;

  request_headers := COALESCE(NULLIF(current_setting('request.headers', true), ''), '{}')::jsonb;

  detected_ip := COALESCE(
    NULLIF(BTRIM(_ip), ''),
    NULLIF(BTRIM(split_part(COALESCE(request_headers ->> 'x-forwarded-for', ''), ',', 1)), ''),
    NULLIF(BTRIM(request_headers ->> 'x-real-ip'), ''),
    NULLIF(BTRIM(request_headers ->> 'cf-connecting-ip'), '')
  );

  INSERT INTO public.employee_sessions (
    user_id,
    session_id,
    device_name,
    browser,
    os,
    location,
    ip,
    user_agent,
    created_at,
    last_seen_at,
    revoked_at
  )
  VALUES (
    auth.uid(),
    _session_id,
    NULLIF(BTRIM(_device_name), ''),
    NULLIF(BTRIM(_browser), ''),
    NULLIF(BTRIM(_os), ''),
    NULLIF(BTRIM(_location), ''),
    detected_ip,
    NULLIF(BTRIM(_user_agent), ''),
    now(),
    now(),
    NULL
  )
  ON CONFLICT (user_id, session_id)
  DO UPDATE SET
    device_name = COALESCE(EXCLUDED.device_name, public.employee_sessions.device_name),
    browser = COALESCE(EXCLUDED.browser, public.employee_sessions.browser),
    os = COALESCE(EXCLUDED.os, public.employee_sessions.os),
    location = COALESCE(EXCLUDED.location, public.employee_sessions.location),
    ip = COALESCE(EXCLUDED.ip, public.employee_sessions.ip),
    user_agent = COALESCE(EXCLUDED.user_agent, public.employee_sessions.user_agent),
    last_seen_at = now();
END;
$$;
