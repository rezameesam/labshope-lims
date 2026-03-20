create or replace function public.enforce_plan_limits()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  current_plan text := 'starter';
  lab_count integer := 0;
  employee_count integer := 0;
  patient_count integer := 0;
  max_labs integer := null;
  max_employees integer := null;
  max_patients integer := null;
  next_plan text := null;
begin
  if new.organization_id is null then
    return new;
  end if;

  select coalesce(setting_value, 'starter')
    into current_plan
  from public.organization_settings
  where organization_id = new.organization_id
    and setting_key = 'plan_tier'
  limit 1;

  if current_plan = 'starter' then
    max_labs := 1;
    max_employees := 10;
    max_patients := 25000;
    next_plan := 'Growth';
  elsif current_plan = 'growth' then
    max_labs := 10;
    max_employees := 100;
    max_patients := 300000;
    next_plan := 'Premium';
  else
    return new;
  end if;

  if tg_table_name = 'labs' then
    select count(*)
      into lab_count
    from public.labs
    where organization_id = new.organization_id
      and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

    if lab_count >= max_labs then
      raise exception '% package supports up to % labs. Upgrade to % to add more labs.',
        initcap(current_plan), max_labs, next_plan;
    end if;
  elsif tg_table_name = 'employees' then
    if coalesce(new.is_active, true) then
      select count(*)
        into employee_count
      from public.employees
      where organization_id = new.organization_id
        and coalesce(is_active, true) = true
        and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

      if employee_count >= max_employees then
        raise exception '% package supports up to % active employees. Upgrade to % to add more staff.',
          initcap(current_plan), max_employees, next_plan;
      end if;
    end if;
  elsif tg_table_name = 'patients' then
    select count(*)
      into patient_count
    from public.patients
    where organization_id = new.organization_id
      and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

    if patient_count >= max_patients then
      raise exception '% package supports up to % patients. Upgrade to % to keep growing your customer base.',
        initcap(current_plan), max_patients, next_plan;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_starter_plan_limits_on_labs on public.labs;
drop trigger if exists enforce_plan_limits_on_labs on public.labs;
create trigger enforce_plan_limits_on_labs
before insert or update on public.labs
for each row
execute function public.enforce_plan_limits();

drop trigger if exists enforce_starter_plan_limits_on_employees on public.employees;
drop trigger if exists enforce_plan_limits_on_employees on public.employees;
create trigger enforce_plan_limits_on_employees
before insert or update on public.employees
for each row
execute function public.enforce_plan_limits();

drop trigger if exists enforce_starter_plan_limits_on_patients on public.patients;
drop trigger if exists enforce_plan_limits_on_patients on public.patients;
create trigger enforce_plan_limits_on_patients
before insert or update on public.patients
for each row
execute function public.enforce_plan_limits();
