-- Store default panel items for multi-result tests (e.g., CBC)
ALTER TABLE public.tests
ADD COLUMN IF NOT EXISTS panel_items JSONB;
