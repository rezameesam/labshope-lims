-- External labs (vendors you outsource tests to)
create table if not exists public.external_labs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  contact_person text,
  phone text,
  email text,
  address text,
  gst_number text,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index idx_external_labs_org on public.external_labs(organization_id);

-- RLS
alter table public.external_labs enable row level security;

create policy "External labs: org members can view"
  on public.external_labs for select
  using (organization_id in (
    select organization_id from public.employees where user_id = auth.uid() and is_active = true
  ));

create policy "External labs: org members can insert"
  on public.external_labs for insert
  with check (organization_id in (
    select organization_id from public.employees where user_id = auth.uid() and is_active = true
  ));

create policy "External labs: org members can update"
  on public.external_labs for update
  using (organization_id in (
    select organization_id from public.employees where user_id = auth.uid() and is_active = true
  ));

-- Add outsource columns to patient_tests
alter table public.patient_tests add column if not exists external_lab_id uuid references public.external_labs(id) on delete set null;
alter table public.patient_tests add column if not exists outsource_cost numeric(15,2);
alter table public.patient_tests add column if not exists outsourced_at timestamptz;
alter table public.patient_tests add column if not exists outsourced_by uuid references auth.users(id) on delete set null;
alter table public.patient_tests add column if not exists outsource_journal_entry_id uuid references public.journal_entries(id) on delete set null;

create index idx_patient_tests_external_lab on public.patient_tests(external_lab_id);

-- Auto-update timestamp on external_labs
create trigger external_labs_updated_at
  before update on public.external_labs
  for each row execute function public.update_updated_at_column();

-- Add default outsource accounts to the seed function
-- 5009 = Outsourcing Expense, 2004 = Outsource Payable
create or replace function public.seed_outsource_accounts(org_id uuid)
returns void language plpgsql security definer as $$
begin
  insert into public.accounts (organization_id, code, name, type, description) values
    (org_id, '5009', 'Outsourcing Expense', 'expense', 'Cost of tests outsourced to external labs'),
    (org_id, '2004', 'Outsource Payable', 'liability', 'Amount owed to external labs for outsourced tests')
  on conflict (organization_id, code) do nothing;
end;
$$;

-- Finance auto-sync: when a patient_test is outsourced, create journal entry
-- Debit 5009 Outsourcing Expense, Credit 2004 Outsource Payable
create or replace function public.finance_sync_outsource()
returns trigger language plpgsql security definer as $$
declare
  v_org_id uuid;
  v_entry_id uuid;
  v_entry_number text;
  v_expense_account_id uuid;
  v_payable_account_id uuid;
  v_count int;
  v_ext_lab_name text;
begin
  -- Only fire when external_lab_id is set and outsource_cost > 0
  if NEW.external_lab_id is null or coalesce(NEW.outsource_cost, 0) <= 0 then return NEW; end if;
  -- Don't re-create if already linked
  if NEW.outsource_journal_entry_id is not null then return NEW; end if;

  v_org_id := NEW.organization_id;
  if v_org_id is null then return NEW; end if;

  select id into v_expense_account_id from public.accounts where organization_id = v_org_id and code = '5009' limit 1;
  select id into v_payable_account_id from public.accounts where organization_id = v_org_id and code = '2004' limit 1;

  if v_expense_account_id is null or v_payable_account_id is null then return NEW; end if;

  select name into v_ext_lab_name from public.external_labs where id = NEW.external_lab_id;

  select count(*) into v_count from public.journal_entries where organization_id = v_org_id;
  v_entry_number := 'AUTO-' || lpad((v_count + 1)::text, 5, '0');

  insert into public.journal_entries (organization_id, entry_number, entry_date, description, reference, status, created_by)
  values (v_org_id, v_entry_number, coalesce(NEW.outsourced_at::date, current_date),
    'Outsource — ' || NEW.test_name || ' to ' || coalesce(v_ext_lab_name, 'External Lab'),
    null, 'posted', NEW.outsourced_by)
  returning id into v_entry_id;

  insert into public.journal_entry_lines (journal_entry_id, account_id, description, debit, credit) values
    (v_entry_id, v_expense_account_id, 'Outsource cost — ' || NEW.test_name, NEW.outsource_cost, 0),
    (v_entry_id, v_payable_account_id, 'Payable to ' || coalesce(v_ext_lab_name, 'External Lab'), 0, NEW.outsource_cost);

  NEW.outsource_journal_entry_id := v_entry_id;
  return NEW;
end;
$$;

drop trigger if exists trg_finance_sync_outsource on public.patient_tests;
create trigger trg_finance_sync_outsource
  before update on public.patient_tests
  for each row
  when (OLD.external_lab_id is distinct from NEW.external_lab_id or OLD.outsource_cost is distinct from NEW.outsource_cost)
  execute function public.finance_sync_outsource();
