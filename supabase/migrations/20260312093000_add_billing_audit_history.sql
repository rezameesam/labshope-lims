ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.invoices
SET updated_by = created_by
WHERE updated_by IS NULL
  AND created_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.billing_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('invoice', 'payment')),
  action TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  old_values JSONB,
  new_values JSONB,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_billing_audit_invoice_id ON public.billing_audit(invoice_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_audit_payment_id ON public.billing_audit(payment_id);
CREATE INDEX IF NOT EXISTS idx_billing_audit_changed_by ON public.billing_audit(changed_by);

ALTER TABLE public.billing_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view billing audit logs" ON public.billing_audit;
CREATE POLICY "Staff can view billing audit logs"
ON public.billing_audit
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

DROP POLICY IF EXISTS "Staff can insert billing audit logs" ON public.billing_audit;
CREATE POLICY "Staff can insert billing audit logs"
ON public.billing_audit
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE OR REPLACE FUNCTION public.log_invoice_billing_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.billing_audit (
      invoice_id,
      entity_type,
      action,
      changed_by,
      new_values
    )
    VALUES (
      NEW.id,
      'invoice',
      'invoice_created',
      NEW.created_by,
      jsonb_build_object(
        'invoice_number', NEW.invoice_number,
        'total_amount', NEW.total_amount,
        'discount_amount', NEW.discount_amount,
        'final_amount', NEW.final_amount,
        'notes', NEW.notes
      )
    );

    RETURN NEW;
  END IF;

  IF
    OLD.total_amount IS NOT DISTINCT FROM NEW.total_amount
    AND OLD.discount_amount IS NOT DISTINCT FROM NEW.discount_amount
    AND OLD.final_amount IS NOT DISTINCT FROM NEW.final_amount
    AND OLD.notes IS NOT DISTINCT FROM NEW.notes
  THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.billing_audit (
    invoice_id,
    entity_type,
    action,
    changed_by,
    old_values,
    new_values
  )
  VALUES (
    NEW.id,
    'invoice',
    CASE
      WHEN OLD.discount_amount IS DISTINCT FROM NEW.discount_amount THEN 'discount_updated'
      ELSE 'invoice_updated'
    END,
    COALESCE(NEW.updated_by, NEW.discount_entered_by, NEW.created_by),
    jsonb_build_object(
      'total_amount', OLD.total_amount,
      'discount_amount', OLD.discount_amount,
      'final_amount', OLD.final_amount,
      'notes', OLD.notes
    ),
    jsonb_build_object(
      'total_amount', NEW.total_amount,
      'discount_amount', NEW.discount_amount,
      'final_amount', NEW.final_amount,
      'notes', NEW.notes
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_audit_invoices ON public.invoices;
CREATE TRIGGER trg_billing_audit_invoices
AFTER INSERT OR UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.log_invoice_billing_changes();

CREATE OR REPLACE FUNCTION public.log_payment_billing_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.billing_audit (
      invoice_id,
      payment_id,
      entity_type,
      action,
      changed_by,
      new_values
    )
    VALUES (
      NEW.invoice_id,
      NEW.id,
      'payment',
      'payment_recorded',
      NEW.received_by,
      jsonb_build_object(
        'amount', NEW.amount,
        'payment_method', NEW.payment_method,
        'payment_date', NEW.payment_date,
        'transaction_id', NEW.transaction_id,
        'notes', NEW.notes
      )
    );

    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.billing_audit (
      invoice_id,
      payment_id,
      entity_type,
      action,
      changed_by,
      old_values,
      new_values
    )
    VALUES (
      NEW.invoice_id,
      NEW.id,
      'payment',
      'payment_updated',
      COALESCE(NEW.received_by, OLD.received_by),
      jsonb_build_object(
        'amount', OLD.amount,
        'payment_method', OLD.payment_method,
        'payment_date', OLD.payment_date,
        'transaction_id', OLD.transaction_id,
        'notes', OLD.notes
      ),
      jsonb_build_object(
        'amount', NEW.amount,
        'payment_method', NEW.payment_method,
        'payment_date', NEW.payment_date,
        'transaction_id', NEW.transaction_id,
        'notes', NEW.notes
      )
    );

    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.billing_audit (
      invoice_id,
      payment_id,
      entity_type,
      action,
      changed_by,
      old_values
    )
    VALUES (
      OLD.invoice_id,
      OLD.id,
      'payment',
      'payment_deleted',
      OLD.received_by,
      jsonb_build_object(
        'amount', OLD.amount,
        'payment_method', OLD.payment_method,
        'payment_date', OLD.payment_date,
        'transaction_id', OLD.transaction_id,
        'notes', OLD.notes
      )
    );

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_audit_payments ON public.payments;
CREATE TRIGGER trg_billing_audit_payments
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.log_payment_billing_changes();
