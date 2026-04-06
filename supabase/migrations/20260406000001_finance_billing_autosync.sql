-- Link invoices/payments to journal entries for auto-sync
alter table public.invoices add column if not exists journal_entry_id uuid references public.journal_entries(id) on delete set null;
alter table public.payments add column if not exists journal_entry_id uuid references public.journal_entries(id) on delete set null;

-- Function: auto-create journal entry when an invoice is created
create or replace function public.finance_sync_invoice()
returns trigger language plpgsql security definer as $$
declare
  v_org_id uuid;
  v_entry_id uuid;
  v_entry_number text;
  v_cash_account_id uuid;
  v_ar_account_id uuid;
  v_revenue_account_id uuid;
  v_count int;
begin
  -- Only process if no journal entry linked yet
  if NEW.journal_entry_id is not null then return NEW; end if;

  v_org_id := NEW.organization_id;
  if v_org_id is null then return NEW; end if;

  -- Look up standard accounts (by code convention)
  select id into v_cash_account_id from public.accounts where organization_id = v_org_id and code = '1001' limit 1;
  select id into v_ar_account_id from public.accounts where organization_id = v_org_id and code = '1003' limit 1;
  select id into v_revenue_account_id from public.accounts where organization_id = v_org_id and code = '4001' limit 1;

  -- Need at least revenue account to proceed
  if v_revenue_account_id is null then return NEW; end if;

  -- Generate entry number
  select count(*) into v_count from public.journal_entries where organization_id = v_org_id;
  v_entry_number := 'AUTO-' || lpad((v_count + 1)::text, 5, '0');

  -- Create journal entry
  insert into public.journal_entries (organization_id, entry_number, entry_date, description, reference, status, created_by)
  values (v_org_id, v_entry_number, coalesce(NEW.created_at::date, current_date),
    'Invoice ' || coalesce(NEW.invoice_number, NEW.id::text),
    NEW.invoice_number, 'posted', NEW.updated_by)
  returning id into v_entry_id;

  if NEW.payment_status = 'paid' and v_cash_account_id is not null then
    -- Fully paid: Debit Cash, Credit Revenue
    insert into public.journal_entry_lines (journal_entry_id, account_id, description, debit, credit) values
      (v_entry_id, v_cash_account_id, 'Payment received — ' || coalesce(NEW.invoice_number, ''), NEW.final_amount, 0),
      (v_entry_id, v_revenue_account_id, 'Test revenue — ' || coalesce(NEW.invoice_number, ''), 0, NEW.final_amount);
  elsif v_ar_account_id is not null then
    -- Unpaid/partial: Debit AR, Credit Revenue
    insert into public.journal_entry_lines (journal_entry_id, account_id, description, debit, credit) values
      (v_entry_id, v_ar_account_id, 'Receivable — ' || coalesce(NEW.invoice_number, ''), NEW.final_amount, 0),
      (v_entry_id, v_revenue_account_id, 'Test revenue — ' || coalesce(NEW.invoice_number, ''), 0, NEW.final_amount);
  end if;

  -- Link back
  NEW.journal_entry_id := v_entry_id;
  return NEW;
end;
$$;

-- Function: auto-create journal entry when a payment is recorded
create or replace function public.finance_sync_payment()
returns trigger language plpgsql security definer as $$
declare
  v_org_id uuid;
  v_entry_id uuid;
  v_entry_number text;
  v_cash_account_id uuid;
  v_ar_account_id uuid;
  v_count int;
  v_invoice_number text;
begin
  if NEW.journal_entry_id is not null then return NEW; end if;

  -- Get org from invoice
  select i.organization_id, i.invoice_number into v_org_id, v_invoice_number
  from public.invoices i where i.id = NEW.invoice_id;

  if v_org_id is null then return NEW; end if;

  select id into v_cash_account_id from public.accounts where organization_id = v_org_id and code = '1001' limit 1;
  select id into v_ar_account_id from public.accounts where organization_id = v_org_id and code = '1003' limit 1;

  if v_cash_account_id is null or v_ar_account_id is null then return NEW; end if;

  select count(*) into v_count from public.journal_entries where organization_id = v_org_id;
  v_entry_number := 'AUTO-' || lpad((v_count + 1)::text, 5, '0');

  insert into public.journal_entries (organization_id, entry_number, entry_date, description, reference, status, created_by)
  values (v_org_id, v_entry_number, coalesce(NEW.payment_date::date, current_date),
    'Payment — ' || coalesce(v_invoice_number, NEW.invoice_id::text),
    NEW.transaction_id, 'posted', NEW.received_by)
  returning id into v_entry_id;

  -- Debit Cash, Credit AR
  insert into public.journal_entry_lines (journal_entry_id, account_id, description, debit, credit) values
    (v_entry_id, v_cash_account_id, 'Payment received — ' || coalesce(NEW.payment_method, 'cash'), NEW.amount, 0),
    (v_entry_id, v_ar_account_id, 'Receivable cleared — ' || coalesce(v_invoice_number, ''), 0, NEW.amount);

  NEW.journal_entry_id := v_entry_id;
  return NEW;
end;
$$;

-- Attach triggers
drop trigger if exists trg_finance_sync_invoice on public.invoices;
create trigger trg_finance_sync_invoice
  before insert on public.invoices
  for each row execute function public.finance_sync_invoice();

drop trigger if exists trg_finance_sync_payment on public.payments;
create trigger trg_finance_sync_payment
  before insert on public.payments
  for each row execute function public.finance_sync_payment();
