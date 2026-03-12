CREATE OR REPLACE FUNCTION public.set_patient_password_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.password_hash IS NULL THEN
    NEW.password_hash := extensions.crypt(NEW.patient_id, extensions.gen_salt('bf'));
  END IF;

  IF NEW.password_reset_required IS NULL THEN
    NEW.password_reset_required := true;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_lab_id_required()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.lab_id IS NULL THEN
    RAISE EXCEPTION 'lab_id is required for % operations', TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_lab_center_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  center_lab_id UUID;
BEGIN
  IF NEW.collection_center_id IS NOT NULL THEN
    SELECT cc.lab_id
    INTO center_lab_id
    FROM public.collection_centers cc
    WHERE cc.id = NEW.collection_center_id;

    IF center_lab_id IS NULL THEN
      RAISE EXCEPTION 'Invalid collection_center_id %', NEW.collection_center_id
        USING ERRCODE = '23503';
    END IF;

    IF NEW.lab_id IS NULL THEN
      NEW.lab_id := center_lab_id;
    ELSIF NEW.lab_id <> center_lab_id THEN
      RAISE EXCEPTION 'collection_center_id % does not belong to lab_id %', NEW.collection_center_id, NEW.lab_id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.lab_id IS NULL THEN
    RAISE EXCEPTION 'lab_id is required for % operations', TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_invoice_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  normalized_final NUMERIC(10,2) := GREATEST(COALESCE(NEW.final_amount, 0), 0);
  normalized_paid NUMERIC(10,2) := GREATEST(COALESCE(NEW.paid_amount, 0), 0);
BEGIN
  NEW.final_amount := normalized_final;
  NEW.paid_amount := normalized_paid;

  IF COALESCE(NEW.payment_status, '') = 'cancelled' AND normalized_paid <= 0 THEN
    NEW.paid_at := NULL;
    RETURN NEW;
  END IF;

  IF normalized_paid >= normalized_final THEN
    NEW.payment_status := 'paid';
    NEW.paid_at := COALESCE(NEW.paid_at, now());
  ELSIF normalized_paid > 0 THEN
    NEW.payment_status := 'partial';
    NEW.paid_at := NULL;
  ELSE
    NEW.payment_status := 'pending';
    NEW.paid_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;
