-- Retroactive sync: create journal entries for existing invoices that don't have one.
-- This function can be called from the UI via supabase.rpc('finance_sync_existing_invoices', { org_id })

create or replace function public.finance_sync_existing_invoices(org_id uuid)
returns int language plpgsql security definer as $$
declare
  v_invoice record;
  v_payment record;
  v_entry_id uuid;
  v_entry_number text;
  v_count int := 0;
  v_seq int;
  v_cash_account_id uuid;
  v_ar_account_id uuid;
  v_revenue_account_id uuid;
begin
  -- Look up standard accounts
  select id into v_cash_account_id from public.accounts where organization_id = org_id and code = '1001' limit 1;
  select id into v_ar_account_id from public.accounts where organization_id = org_id and code = '1003' limit 1;
  select id into v_revenue_account_id from public.accounts where organization_id = org_id and code = '4001' limit 1;

  if v_revenue_account_id is null then return 0; end if;

  -- Get current sequence number
  select count(*) into v_seq from public.journal_entries where organization_id = org_id;

  -- Sync invoices without journal entries
  for v_invoice in
    select * from public.invoices
    where organization_id = org_id
      and journal_entry_id is null
      and final_amount > 0
    order by created_at
  loop
    v_seq := v_seq + 1;
    v_entry_number := 'SYNC-' || lpad(v_seq::text, 5, '0');

    insert into public.journal_entries (organization_id, entry_number, entry_date, description, reference, status, created_by)
    values (org_id, v_entry_number, coalesce(v_invoice.created_at::date, current_date),
      'Invoice ' || coalesce(v_invoice.invoice_number, v_invoice.id::text),
      v_invoice.invoice_number, 'posted', v_invoice.updated_by)
    returning id into v_entry_id;

    if v_invoice.payment_status = 'paid' and v_cash_account_id is not null then
      insert into public.journal_entry_lines (journal_entry_id, account_id, description, debit, credit) values
        (v_entry_id, v_cash_account_id, 'Payment received — ' || coalesce(v_invoice.invoice_number, ''), v_invoice.final_amount, 0),
        (v_entry_id, v_revenue_account_id, 'Test revenue — ' || coalesce(v_invoice.invoice_number, ''), 0, v_invoice.final_amount);
    elsif v_ar_account_id is not null then
      insert into public.journal_entry_lines (journal_entry_id, account_id, description, debit, credit) values
        (v_entry_id, v_ar_account_id, 'Receivable — ' || coalesce(v_invoice.invoice_number, ''), v_invoice.final_amount, 0),
        (v_entry_id, v_revenue_account_id, 'Test revenue — ' || coalesce(v_invoice.invoice_number, ''), 0, v_invoice.final_amount);
    end if;

    update public.invoices set journal_entry_id = v_entry_id where id = v_invoice.id;
    v_count := v_count + 1;
  end loop;

  -- Sync payments without journal entries
  for v_payment in
    select p.*, i.invoice_number, i.organization_id as inv_org_id
    from public.payments p
    join public.invoices i on i.id = p.invoice_id
    where i.organization_id = org_id
      and p.journal_entry_id is null
      and p.amount > 0
    order by p.payment_date
  loop
    if v_cash_account_id is null or v_ar_account_id is null then continue; end if;

    v_seq := v_seq + 1;
    v_entry_number := 'SYNC-' || lpad(v_seq::text, 5, '0');

    insert into public.journal_entries (organization_id, entry_number, entry_date, description, reference, status, created_by)
    values (org_id, v_entry_number, coalesce(v_payment.payment_date::date, current_date),
      'Payment — ' || coalesce(v_payment.invoice_number, v_payment.invoice_id::text),
      v_payment.transaction_id, 'posted', v_payment.received_by)
    returning id into v_entry_id;

    insert into public.journal_entry_lines (journal_entry_id, account_id, description, debit, credit) values
      (v_entry_id, v_cash_account_id, 'Payment received — ' || coalesce(v_payment.payment_method, 'cash'), v_payment.amount, 0),
      (v_entry_id, v_ar_account_id, 'Receivable cleared — ' || coalesce(v_payment.invoice_number, ''), 0, v_payment.amount);

    update public.payments set journal_entry_id = v_entry_id where id = v_payment.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
