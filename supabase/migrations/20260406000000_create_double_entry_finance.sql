-- Double-entry accounting system for labs/organizations

-- Chart of Accounts
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  type text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  parent_id uuid references public.accounts(id) on delete set null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

-- Journal Entries (header)
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entry_number text not null,
  entry_date date not null default current_date,
  description text not null,
  reference text,
  status text not null default 'posted' check (status in ('draft', 'posted')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, entry_number)
);

-- Journal Entry Lines (debit/credit)
create table if not exists public.journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  description text,
  debit numeric(15,2) not null default 0 check (debit >= 0),
  credit numeric(15,2) not null default 0 check (credit >= 0),
  check (debit > 0 or credit > 0),
  check (not (debit > 0 and credit > 0))
);

-- Indexes
create index idx_accounts_org on public.accounts(organization_id);
create index idx_accounts_type on public.accounts(organization_id, type);
create index idx_journal_entries_org on public.journal_entries(organization_id);
create index idx_journal_entries_date on public.journal_entries(organization_id, entry_date);
create index idx_journal_entry_lines_entry on public.journal_entry_lines(journal_entry_id);
create index idx_journal_entry_lines_account on public.journal_entry_lines(account_id);

-- RLS
alter table public.accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_entry_lines enable row level security;

-- Accounts policies
create policy "Accounts: org members can view"
  on public.accounts for select
  using (
    organization_id in (
      select organization_id from public.employees where user_id = auth.uid() and is_active = true
    )
  );

create policy "Accounts: org admins can insert"
  on public.accounts for insert
  with check (
    organization_id in (
      select organization_id from public.employees where user_id = auth.uid() and is_active = true
    )
  );

create policy "Accounts: org admins can update"
  on public.accounts for update
  using (
    organization_id in (
      select organization_id from public.employees where user_id = auth.uid() and is_active = true
    )
  );

-- Journal entries policies
create policy "Journal entries: org members can view"
  on public.journal_entries for select
  using (
    organization_id in (
      select organization_id from public.employees where user_id = auth.uid() and is_active = true
    )
  );

create policy "Journal entries: org members can insert"
  on public.journal_entries for insert
  with check (
    organization_id in (
      select organization_id from public.employees where user_id = auth.uid() and is_active = true
    )
  );

create policy "Journal entries: org members can update"
  on public.journal_entries for update
  using (
    organization_id in (
      select organization_id from public.employees where user_id = auth.uid() and is_active = true
    )
  );

-- Journal entry lines policies
create policy "Journal lines: viewable via entry"
  on public.journal_entry_lines for select
  using (
    journal_entry_id in (
      select je.id from public.journal_entries je
      join public.employees e on e.organization_id = je.organization_id
      where e.user_id = auth.uid() and e.is_active = true
    )
  );

create policy "Journal lines: insertable via entry"
  on public.journal_entry_lines for insert
  with check (
    journal_entry_id in (
      select je.id from public.journal_entries je
      join public.employees e on e.organization_id = je.organization_id
      where e.user_id = auth.uid() and e.is_active = true
    )
  );

create policy "Journal lines: updatable via entry"
  on public.journal_entry_lines for update
  using (
    journal_entry_id in (
      select je.id from public.journal_entries je
      join public.employees e on e.organization_id = je.organization_id
      where e.user_id = auth.uid() and e.is_active = true
    )
  );

-- Auto-update timestamps
create trigger accounts_updated_at
  before update on public.accounts
  for each row execute function public.update_updated_at_column();

create trigger journal_entries_updated_at
  before update on public.journal_entries
  for each row execute function public.update_updated_at_column();

-- Seed default chart of accounts for new organizations (function)
create or replace function public.seed_default_accounts(org_id uuid)
returns void language plpgsql security definer as $$
begin
  insert into public.accounts (organization_id, code, name, type, description) values
    -- Assets
    (org_id, '1001', 'Cash', 'asset', 'Cash on hand'),
    (org_id, '1002', 'Bank Account', 'asset', 'Primary bank account'),
    (org_id, '1003', 'Accounts Receivable', 'asset', 'Money owed by patients/clients'),
    (org_id, '1004', 'Lab Equipment', 'asset', 'Laboratory equipment and instruments'),
    (org_id, '1005', 'Inventory - Reagents', 'asset', 'Lab reagents and supplies inventory'),
    -- Liabilities
    (org_id, '2001', 'Accounts Payable', 'liability', 'Money owed to suppliers'),
    (org_id, '2002', 'Salaries Payable', 'liability', 'Employee salaries due'),
    (org_id, '2003', 'Tax Payable', 'liability', 'GST and other taxes due'),
    -- Equity
    (org_id, '3001', 'Owner Capital', 'equity', 'Owner investment in business'),
    (org_id, '3002', 'Retained Earnings', 'equity', 'Accumulated profits'),
    -- Revenue
    (org_id, '4001', 'Test Revenue', 'revenue', 'Income from lab tests'),
    (org_id, '4002', 'Consultation Revenue', 'revenue', 'Income from consultations'),
    (org_id, '4003', 'Other Revenue', 'revenue', 'Miscellaneous income'),
    -- Expenses
    (org_id, '5001', 'Reagent Expenses', 'expense', 'Cost of lab reagents'),
    (org_id, '5002', 'Salary Expenses', 'expense', 'Employee salaries'),
    (org_id, '5003', 'Rent Expense', 'expense', 'Office/lab rent'),
    (org_id, '5004', 'Utilities Expense', 'expense', 'Electricity, water, internet'),
    (org_id, '5005', 'Equipment Maintenance', 'expense', 'Lab equipment servicing'),
    (org_id, '5006', 'Office Supplies', 'expense', 'General office supplies'),
    (org_id, '5007', 'Marketing Expense', 'expense', 'Advertising and promotions'),
    (org_id, '5008', 'Miscellaneous Expense', 'expense', 'Other expenses')
  on conflict (organization_id, code) do nothing;
end;
$$;
