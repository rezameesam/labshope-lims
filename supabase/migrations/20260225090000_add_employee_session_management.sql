-- Employee active session tracking and revocation

CREATE TABLE IF NOT EXISTS public.employee_sessions (
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

CREATE INDEX IF NOT EXISTS idx_employee_sessions_user_last_seen
  ON public.employee_sessions(user_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_employee_sessions_session_id
  ON public.employee_sessions(session_id);

ALTER TABLE public.employee_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view own employee sessions" ON public.employee_sessions;
CREATE POLICY "Staff can view own employee sessions"
ON public.employee_sessions
FOR SELECT
USING (
  auth.uid() = user_id
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'employee'::app_role)
    OR public.has_role(auth.uid(), 'collector'::app_role)
  )
);

DROP POLICY IF EXISTS "Staff can upsert own employee sessions" ON public.employee_sessions;
CREATE POLICY "Staff can upsert own employee sessions"
ON public.employee_sessions
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'employee'::app_role)
    OR public.has_role(auth.uid(), 'collector'::app_role)
  )
);

DROP POLICY IF EXISTS "Staff can update own employee sessions" ON public.employee_sessions;
CREATE POLICY "Staff can update own employee sessions"
ON public.employee_sessions
FOR UPDATE
USING (
  auth.uid() = user_id
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'employee'::app_role)
    OR public.has_role(auth.uid(), 'collector'::app_role)
  )
)
WITH CHECK (
  auth.uid() = user_id
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'employee'::app_role)
    OR public.has_role(auth.uid(), 'collector'::app_role)
  )
);

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
    last_seen_at = now(),
    revoked_at = NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_employee_sessions(_current_session_id UUID DEFAULT NULL)
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

  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'employee'::app_role)
    OR public.has_role(auth.uid(), 'collector'::app_role)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    es.session_id,
    es.device_name,
    es.browser,
    es.os,
    es.location,
    es.ip,
    es.created_at,
    es.last_seen_at,
    es.session_id = _current_session_id
  FROM public.employee_sessions es
  INNER JOIN auth.sessions s
    ON s.id = es.session_id
   AND s.user_id = es.user_id
  WHERE es.user_id = auth.uid()
    AND es.revoked_at IS NULL
  ORDER BY
    (es.session_id = _current_session_id) DESC,
    es.last_seen_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_employee_session(_session_id UUID)
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

  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'employee'::app_role)
    OR public.has_role(auth.uid(), 'collector'::app_role)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  DELETE FROM auth.sessions s
  WHERE s.id = _session_id
    AND s.user_id = auth.uid();

  IF FOUND THEN
    touched := TRUE;
  END IF;

  UPDATE public.employee_sessions
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

CREATE OR REPLACE FUNCTION public.revoke_other_employee_sessions(_current_session_id UUID)
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

  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'employee'::app_role)
    OR public.has_role(auth.uid(), 'collector'::app_role)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  DELETE FROM auth.sessions s
  WHERE s.user_id = auth.uid()
    AND s.id IS DISTINCT FROM _current_session_id;

  UPDATE public.employee_sessions
  SET revoked_at = now()
  WHERE user_id = auth.uid()
    AND revoked_at IS NULL
    AND session_id IS DISTINCT FROM _current_session_id;

  GET DIAGNOSTICS revoked_count = ROW_COUNT;
  RETURN revoked_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_all_employee_sessions()
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

  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'employee'::app_role)
    OR public.has_role(auth.uid(), 'collector'::app_role)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  DELETE FROM auth.sessions s
  WHERE s.user_id = auth.uid();

  UPDATE public.employee_sessions
  SET revoked_at = now()
  WHERE user_id = auth.uid()
    AND revoked_at IS NULL;

  GET DIAGNOSTICS revoked_count = ROW_COUNT;
  RETURN revoked_count;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_employee_session(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_employee_sessions(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_employee_session(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_other_employee_sessions(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_all_employee_sessions() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_employee_session(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_employee_sessions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_employee_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_other_employee_sessions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_all_employee_sessions() TO authenticated;
