-- Fix inventory organization sync triggers so each table only references fields it actually has.

CREATE OR REPLACE FUNCTION public.sync_organization_from_inventory_item()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  item_org_id UUID;
BEGIN
  IF NEW.item_id IS NOT NULL THEN
    SELECT ii.organization_id
    INTO item_org_id
    FROM public.inventory_items ii
    WHERE ii.id = NEW.item_id;

    IF item_org_id IS NOT NULL THEN
      NEW.organization_id := item_org_id;
    END IF;
  END IF;

  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.get_default_organization_id();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_organization_from_inventory_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  item_org_id UUID;
  patient_test_org_id UUID;
BEGIN
  IF NEW.item_id IS NOT NULL THEN
    SELECT ii.organization_id
    INTO item_org_id
    FROM public.inventory_items ii
    WHERE ii.id = NEW.item_id;

    IF item_org_id IS NOT NULL THEN
      NEW.organization_id := item_org_id;
    END IF;
  END IF;

  IF NEW.organization_id IS NULL AND NEW.patient_test_id IS NOT NULL THEN
    SELECT pt.organization_id
    INTO patient_test_org_id
    FROM public.patient_tests pt
    WHERE pt.id = NEW.patient_test_id;

    IF patient_test_org_id IS NOT NULL THEN
      NEW.organization_id := patient_test_org_id;
    END IF;
  END IF;

  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.get_default_organization_id();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg00_inventory_usage_sync_organization ON public.inventory_usage;
CREATE TRIGGER trg00_inventory_usage_sync_organization
BEFORE INSERT OR UPDATE ON public.inventory_usage
FOR EACH ROW
EXECUTE FUNCTION public.sync_organization_from_inventory_usage();
