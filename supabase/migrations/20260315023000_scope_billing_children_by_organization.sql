ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.billing_audit
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_items_organization_id
  ON public.invoice_items(organization_id);

CREATE INDEX IF NOT EXISTS idx_payments_organization_id
  ON public.payments(organization_id);

CREATE INDEX IF NOT EXISTS idx_billing_audit_organization_id
  ON public.billing_audit(organization_id);

CREATE INDEX IF NOT EXISTS idx_billing_audit_organization_changed_at
  ON public.billing_audit(organization_id, changed_at DESC);

UPDATE public.invoice_items ii
SET organization_id = i.organization_id
FROM public.invoices i
WHERE i.id = ii.invoice_id
  AND ii.organization_id IS NULL;

UPDATE public.payments p
SET organization_id = i.organization_id
FROM public.invoices i
WHERE i.id = p.invoice_id
  AND p.organization_id IS NULL;

UPDATE public.billing_audit ba
SET organization_id = COALESCE(
  (
    SELECT p.organization_id
    FROM public.payments p
    WHERE p.id = ba.payment_id
    LIMIT 1
  ),
  i.organization_id
)
FROM public.invoices i
WHERE i.id = ba.invoice_id
  AND ba.organization_id IS NULL;

CREATE OR REPLACE FUNCTION public.get_invoice_organization_id(_invoice_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.organization_id
  FROM public.invoices i
  WHERE i.id = _invoice_id
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.sync_billing_child_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_org_id UUID;
BEGIN
  resolved_org_id := COALESCE(
    NEW.organization_id,
    public.get_invoice_organization_id(NEW.invoice_id)
  );

  NEW.organization_id := resolved_org_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg00_invoice_items_sync_organization ON public.invoice_items;
CREATE TRIGGER trg00_invoice_items_sync_organization
BEFORE INSERT OR UPDATE ON public.invoice_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_billing_child_organization();

DROP TRIGGER IF EXISTS trg00_payments_sync_organization ON public.payments;
CREATE TRIGGER trg00_payments_sync_organization
BEFORE INSERT OR UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.sync_billing_child_organization();

CREATE OR REPLACE FUNCTION public.sync_billing_audit_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.organization_id := COALESCE(
    NEW.organization_id,
    public.get_invoice_organization_id(NEW.invoice_id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg00_billing_audit_sync_organization ON public.billing_audit;
CREATE TRIGGER trg00_billing_audit_sync_organization
BEFORE INSERT OR UPDATE ON public.billing_audit
FOR EACH ROW
EXECUTE FUNCTION public.sync_billing_audit_organization();

DROP POLICY IF EXISTS "Patients can view their own invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Staff can view invoice items by lab" ON public.invoice_items;
DROP POLICY IF EXISTS "Staff can insert invoice items by lab" ON public.invoice_items;
DROP POLICY IF EXISTS "Staff can update invoice items by lab" ON public.invoice_items;
DROP POLICY IF EXISTS "Staff can delete invoice items by lab" ON public.invoice_items;

CREATE POLICY "Patients can view their own invoice items"
ON public.invoice_items
FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.invoices i
    JOIN public.patients p ON p.id = i.patient_id
    WHERE i.id = invoice_items.invoice_id
      AND i.organization_id = invoice_items.organization_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Staff can manage invoice items by organization"
ON public.invoice_items
FOR ALL
TO authenticated
USING (
  organization_id IS NOT NULL
  AND public.user_has_organization_access(auth.uid(), organization_id)
)
WITH CHECK (
  organization_id IS NOT NULL
  AND public.user_has_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Patients can view their own payments" ON public.payments;
DROP POLICY IF EXISTS "Staff can view payments by lab" ON public.payments;
DROP POLICY IF EXISTS "Staff can insert payments by lab" ON public.payments;
DROP POLICY IF EXISTS "Staff can update payments by lab" ON public.payments;
DROP POLICY IF EXISTS "Staff can delete payments by lab" ON public.payments;

CREATE POLICY "Patients can view their own payments"
ON public.payments
FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.invoices i
    JOIN public.patients p ON p.id = i.patient_id
    WHERE i.id = payments.invoice_id
      AND i.organization_id = payments.organization_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Staff can manage payments by organization"
ON public.payments
FOR ALL
TO authenticated
USING (
  organization_id IS NOT NULL
  AND public.user_has_organization_access(auth.uid(), organization_id)
)
WITH CHECK (
  organization_id IS NOT NULL
  AND public.user_has_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Staff can view billing audit logs" ON public.billing_audit;
DROP POLICY IF EXISTS "Staff can insert billing audit logs" ON public.billing_audit;

CREATE POLICY "Staff can view billing audit logs by organization"
ON public.billing_audit
FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL
  AND public.user_has_organization_access(auth.uid(), organization_id)
);

CREATE POLICY "Staff can insert billing audit logs by organization"
ON public.billing_audit
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id IS NOT NULL
  AND public.user_has_organization_access(auth.uid(), organization_id)
);

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
      organization_id,
      entity_type,
      action,
      changed_by,
      new_values
    )
    VALUES (
      NEW.id,
      NEW.organization_id,
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
    organization_id,
    entity_type,
    action,
    changed_by,
    old_values,
    new_values
  )
  VALUES (
    NEW.id,
    NEW.organization_id,
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
      organization_id,
      entity_type,
      action,
      changed_by,
      new_values
    )
    VALUES (
      NEW.invoice_id,
      NEW.id,
      NEW.organization_id,
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
      organization_id,
      entity_type,
      action,
      changed_by,
      old_values,
      new_values
    )
    VALUES (
      NEW.invoice_id,
      NEW.id,
      NEW.organization_id,
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
      organization_id,
      entity_type,
      action,
      changed_by,
      old_values
    )
    VALUES (
      OLD.invoice_id,
      NULL,
      OLD.organization_id,
      'payment',
      'payment_deleted',
      OLD.received_by,
      jsonb_build_object(
        'payment_id', OLD.id,
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
