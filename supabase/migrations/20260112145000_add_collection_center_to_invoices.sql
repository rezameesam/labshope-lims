-- Add collection_center_id to invoices so PostgREST can join collection_centers.
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS collection_center_id UUID REFERENCES public.collection_centers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_collection_center_id ON public.invoices(collection_center_id);
