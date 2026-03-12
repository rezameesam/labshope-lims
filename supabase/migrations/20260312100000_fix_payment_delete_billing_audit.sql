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
      NULL,
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
