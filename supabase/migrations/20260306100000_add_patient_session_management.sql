-- Patient active session tracking and revocation

CREATE TABLE IF NOT EXISTS public.patient_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  device_name TEXT,
  browser TEXT,
  os TEXT,
  location TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  UNIQUE (user_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_patient_sessions_user_last_seen
  ON public.patient_sessions(user_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_sessions_session_id
  ON public.patient_sessions(session_id);

ALTER TABLE public.patient_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can view own sessions" ON public.patient_sessions;
CREATE POLICY "Patients can view own sessions"
ON public.patient_sessions
FOR SELECT
USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
  )
);

DROP POLICY IF EXISTS "Patients can insert own sessions" ON public.patient_sessions;
CREATE POLICY "Patients can insert own sessions"
ON public.patient_sessions
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
  )
);

DROP POLICY IF EXISTS "Patients can update own sessions" ON public.patient_sessions;
CREATE POLICY "Patients can update own sessions"
ON public.patient_sessions
FOR UPDATE
USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
  )
)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
  )
);

CREATE OR REPLACE FUNCTION public.upsert_patient_session(
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.sessions s
    WHERE s.id = _session_id
      AND s.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Session inactive';
  END IF;

  SELECT ps.revoked_at
    INTO existing_revoked_at
  FROM public.patient_sessions ps
  WHERE ps.user_id = auth.uid()
    AND ps.session_id = _session_id;

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

  INSERT INTO public.patient_sessions (
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
    device_name = COALESCE(EXCLUDED.device_name, public.patient_sessions.device_name),
    browser = COALESCE(EXCLUDED.browser, public.patient_sessions.browser),
    os = COALESCE(EXCLUDED.os, public.patient_sessions.os),
    location = COALESCE(EXCLUDED.location, public.patient_sessions.location),
    ip = COALESCE(EXCLUDED.ip, public.patient_sessions.ip),
    user_agent = COALESCE(EXCLUDED.user_agent, public.patient_sessions.user_agent),
    last_seen_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.list_patient_sessions(_current_session_id UUID DEFAULT NULL)
RETURNS TABLE (
  session_id UUID,
  device_name TEXT,
  browser TEXT,
  os TEXT,
  location TEXT,
  ip TEXT,
  created_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  is_current BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    ps.session_id,
    ps.device_name,
    ps.browser,
    ps.os,
    ps.location,
    ps.ip,
    ps.created_at,
    ps.last_seen_at,
    ps.session_id = _current_session_id
  FROM public.patient_sessions ps
  INNER JOIN auth.sessions s
    ON s.id = ps.session_id
   AND s.user_id = ps.user_id
  WHERE ps.user_id = auth.uid()
    AND ps.revoked_at IS NULL
  ORDER BY
    (ps.session_id = _current_session_id) DESC,
    ps.last_seen_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_patient_session(_session_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  touched BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  DELETE FROM auth.sessions s
  WHERE s.id = _session_id
    AND s.user_id = auth.uid();

  IF FOUND THEN
    touched := TRUE;
  END IF;

  UPDATE public.patient_sessions
  SET revoked_at = now()
  WHERE user_id = auth.uid()
    AND session_id = _session_id
    AND revoked_at IS NULL;

  IF FOUND THEN
    touched := TRUE;
  END IF;

  RETURN touched;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_other_patient_sessions(_current_session_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  revoked_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _current_session_id IS NULL THEN
    RAISE EXCEPTION 'Current session id required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  DELETE FROM auth.sessions s
  WHERE s.user_id = auth.uid()
    AND s.id IS DISTINCT FROM _current_session_id;

  GET DIAGNOSTICS revoked_count = ROW_COUNT;

  UPDATE public.patient_sessions
  SET revoked_at = now()
  WHERE user_id = auth.uid()
    AND revoked_at IS NULL
    AND session_id IS DISTINCT FROM _current_session_id;

  RETURN revoked_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_all_patient_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  revoked_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  DELETE FROM auth.sessions s
  WHERE s.user_id = auth.uid();

  GET DIAGNOSTICS revoked_count = ROW_COUNT;

  UPDATE public.patient_sessions
  SET revoked_at = now()
  WHERE user_id = auth.uid()
    AND revoked_at IS NULL;

  RETURN revoked_count;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_patient_session(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_patient_sessions(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_patient_session(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_other_patient_sessions(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_all_patient_sessions() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_patient_session(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_patient_sessions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_patient_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_other_patient_sessions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_all_patient_sessions() TO authenticated;
