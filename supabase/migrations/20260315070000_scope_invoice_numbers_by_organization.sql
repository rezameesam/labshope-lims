ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;

DROP INDEX IF EXISTS public.invoices_invoice_number_key;
DROP INDEX IF EXISTS public.idx_invoices_org_invoice_number;
DROP INDEX IF EXISTS public.idx_invoices_invoice_number_null_org;

CREATE UNIQUE INDEX idx_invoices_org_invoice_number
  ON public.invoices (organization_id, invoice_number)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX idx_invoices_invoice_number_null_org
  ON public.invoices (invoice_number)
  WHERE organization_id IS NULL;

DROP FUNCTION IF EXISTS public.generate_invoice_number();

CREATE OR REPLACE FUNCTION public.generate_invoice_number(p_organization_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_number text;
  year_prefix text;
  next_seq integer;
  organization_lock_key text;
BEGIN
  year_prefix := 'INV' || TO_CHAR(CURRENT_DATE, 'YY');
  organization_lock_key := COALESCE(p_organization_id::text, 'unscoped');

  PERFORM pg_advisory_xact_lock(hashtext('invoice-number:' || organization_lock_key || ':' || year_prefix));

  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 6) AS integer)), 0) + 1
  INTO next_seq
  FROM public.invoices
  WHERE invoice_number LIKE year_prefix || '%'
    AND (
      (p_organization_id IS NULL AND organization_id IS NULL)
      OR organization_id = p_organization_id
    );

  new_number := year_prefix || LPAD(next_seq::text, 5, '0');

  RETURN new_number;
END;
$$;
