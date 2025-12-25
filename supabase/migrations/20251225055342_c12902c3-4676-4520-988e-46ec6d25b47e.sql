-- Add audit columns to patient_tests table
ALTER TABLE public.patient_tests
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS result_entered_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS result_entered_at timestamp with time zone;

-- Create audit log table for detailed history
CREATE TABLE public.patient_test_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_test_id uuid NOT NULL REFERENCES public.patient_tests(id) ON DELETE CASCADE,
  action text NOT NULL, -- 'created', 'updated', 'result_added', 'status_changed', 'deleted'
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamp with time zone NOT NULL DEFAULT now(),
  old_values jsonb,
  new_values jsonb,
  notes text
);

-- Enable RLS on audit table
ALTER TABLE public.patient_test_audit ENABLE ROW LEVEL SECURITY;

-- Staff can view audit logs
CREATE POLICY "Staff can view audit logs"
ON public.patient_test_audit
FOR SELECT
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'employee'));

-- Staff can insert audit logs
CREATE POLICY "Staff can insert audit logs"
ON public.patient_test_audit
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'employee'));

-- Create function to auto-log changes
CREATE OR REPLACE FUNCTION public.log_patient_test_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO patient_test_audit (patient_test_id, action, changed_by, new_values)
    VALUES (NEW.id, 'created', NEW.created_by, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Check what changed
    IF OLD.result IS DISTINCT FROM NEW.result THEN
      INSERT INTO patient_test_audit (patient_test_id, action, changed_by, old_values, new_values)
      VALUES (NEW.id, 'result_updated', NEW.updated_by, 
        jsonb_build_object('result', OLD.result, 'status', OLD.status),
        jsonb_build_object('result', NEW.result, 'status', NEW.status));
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO patient_test_audit (patient_test_id, action, changed_by, old_values, new_values)
      VALUES (NEW.id, 'status_changed', NEW.updated_by,
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status));
    ELSE
      INSERT INTO patient_test_audit (patient_test_id, action, changed_by, old_values, new_values)
      VALUES (NEW.id, 'updated', NEW.updated_by, to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- Create trigger for audit logging
CREATE TRIGGER patient_test_audit_trigger
AFTER INSERT OR UPDATE ON public.patient_tests
FOR EACH ROW
EXECUTE FUNCTION public.log_patient_test_changes();