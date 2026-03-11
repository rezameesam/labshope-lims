ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS discount_entered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_discount_entered_by
ON public.invoices(discount_entered_by);

UPDATE public.invoices
SET discount_entered_by = created_by
WHERE COALESCE(discount_amount, 0) > 0
  AND discount_entered_by IS NULL
  AND created_by IS NOT NULL;

COMMENT ON COLUMN public.invoices.discount_entered_by IS
'Tracks which staff user last entered the current invoice discount.';
