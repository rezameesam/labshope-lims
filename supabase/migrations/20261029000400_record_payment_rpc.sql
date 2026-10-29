-- record_payment: take a payment against a bill in ONE call.
--
-- What the web app does in two steps (insert the payment, then update the bill's paid amount) as one
-- atomic, idempotent call, so the desktop app can queue payments offline and replay them safely.
-- Idempotent on payload->>'payment_id' (used as the payment row's id).
--
-- The accounting link is unchanged and automatic: inserting the payment fires finance_sync_payment
-- (Dr Cash / Cr Receivable) and billing_audit, and the bill's status is recomputed by
-- normalize_invoice_payment_status. SECURITY INVOKER, so row level security applies as for direct inserts.
--
-- Payload (jsonb):
--   payment_id, invoice_id, organization_id   uuid, required
--   amount                                    numeric > 0, required
--   payment_method                            cash | upi | card | online | bank_transfer (default cash)
--   transaction_id, notes                     text, optional
--   payment_date                              timestamptz, optional (default now)

create or replace function public.record_payment(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid := nullif(p_payload->>'organization_id', '')::uuid;
  v_payment uuid := nullif(p_payload->>'payment_id', '')::uuid;
  v_invoice uuid := nullif(p_payload->>'invoice_id', '')::uuid;
  v_amount numeric := nullif(p_payload->>'amount', '')::numeric;
  v_method text := coalesce(nullif(p_payload->>'payment_method', ''), 'cash');
  v_date timestamptz := coalesce(nullif(p_payload->>'payment_date', '')::timestamptz, now());
  v_bill record;
  v_existing record;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if v_org is null or v_payment is null or v_invoice is null then
    raise exception 'organization_id, payment_id and invoice_id are required' using errcode = '22023';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Payment amount must be greater than zero' using errcode = '22023';
  end if;
  if v_method not in ('cash', 'upi', 'card', 'online', 'bank_transfer') then
    raise exception 'Unknown payment method: %', v_method using errcode = '22023';
  end if;

  -- Idempotent replay: this payment was already recorded.
  select p.id, p.invoice_id, p.organization_id into v_existing from public.payments p where p.id = v_payment;
  if found then
    if v_existing.organization_id is distinct from v_org or v_existing.invoice_id is distinct from v_invoice then
      raise exception 'payment_id already used' using errcode = '23505';
    end if;
    select i.paid_amount, i.final_amount, i.payment_status into v_bill from public.invoices i where i.id = v_invoice;
    return jsonb_build_object(
      'payment_id', v_payment, 'invoice_id', v_invoice,
      'paid_amount', v_bill.paid_amount, 'balance', greatest(v_bill.final_amount - v_bill.paid_amount, 0),
      'payment_status', v_bill.payment_status, 'replayed', true);
  end if;

  -- Lock the bill so two payments at once can't both squeeze past the balance check.
  select i.id, i.organization_id, i.final_amount, i.paid_amount, i.payment_status into v_bill
    from public.invoices i where i.id = v_invoice for update;
  if not found then
    raise exception 'Bill not found' using errcode = 'P0002';
  end if;
  if v_bill.organization_id is distinct from v_org then
    raise exception 'Bill not found' using errcode = 'P0002';
  end if;
  if v_bill.payment_status = 'cancelled' then
    raise exception 'This bill is cancelled' using errcode = '22023';
  end if;
  if v_amount > v_bill.final_amount - v_bill.paid_amount + 0.005 then
    raise exception 'Payment is more than the balance due (%)', v_bill.final_amount - v_bill.paid_amount using errcode = '22023';
  end if;

  insert into public.payments (id, invoice_id, organization_id, amount, payment_method, payment_gateway,
                               transaction_id, payment_date, received_by, notes)
  values (v_payment, v_invoice, v_org, v_amount, v_method, 'manual',
          nullif(p_payload->>'transaction_id', ''), v_date, v_user, nullif(p_payload->>'notes', ''));

  update public.invoices
     set paid_amount = v_bill.paid_amount + v_amount,
         payment_method = v_method
   where id = v_invoice and organization_id = v_org
  returning paid_amount, final_amount, payment_status into v_bill;

  return jsonb_build_object(
    'payment_id', v_payment, 'invoice_id', v_invoice,
    'paid_amount', v_bill.paid_amount, 'balance', greatest(v_bill.final_amount - v_bill.paid_amount, 0),
    'payment_status', v_bill.payment_status, 'replayed', false);
end;
$$;

grant execute on function public.record_payment(jsonb) to authenticated;
