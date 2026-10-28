-- Data fixes for the IRM and Lifeline tenants.
--
-- Idempotent and safe to run anywhere: every statement is scoped to these two organizations by id,
-- so on a database that does not contain them (a fresh local database, CI) it changes nothing.
--
-- IRM  (99809454-b99a-47a5-a07b-b71e636ef44b)
--   - irmclinic.com becomes the primary address; www.irmclinic.com is added as an alias.
--   - lab.irmclinic.com and irm.labshope.com are kept for now (lab.irmclinic.com is removed by a later
--     migration once irmclinic.com serves the latest app).
-- Lifeline (4281badb-c6cc-43ea-a6ca-b793deb946a5)
--   - its trial had been suspended by the daily trial-expiry job: reactivate it.
--   - the name was misspelled "Life Life Clinical Laboratory".

-- IRM: make irmclinic.com the primary domain (two statements, so a one-primary-per-org index is never violated)
update public.organization_domains
set is_primary = false
where organization_id = '99809454-b99a-47a5-a07b-b71e636ef44b'
  and is_primary
  and lower(domain) <> 'irmclinic.com';

update public.organization_domains
set is_primary = true
where organization_id = '99809454-b99a-47a5-a07b-b71e636ef44b'
  and lower(domain) = 'irmclinic.com';

-- IRM: www.irmclinic.com resolves to the same lab
insert into public.organization_domains (organization_id, domain, is_primary, verified_at)
select '99809454-b99a-47a5-a07b-b71e636ef44b', 'www.irmclinic.com', false, now()
where exists (select 1 from public.organizations where id = '99809454-b99a-47a5-a07b-b71e636ef44b')
  and not exists (select 1 from public.organization_domains where lower(domain) = 'www.irmclinic.com');

-- Lifeline: reactivate and fix the name
update public.organizations
set status = 'active',
    updated_at = now()
where id = '4281badb-c6cc-43ea-a6ca-b793deb946a5'
  and status = 'suspended';

update public.organizations
set display_name = 'Lifeline Clinical Laboratory',
    legal_name = case when legal_name ilike 'Life Life%' then 'Lifeline Clinical Laboratory' else legal_name end,
    updated_at = now()
where id = '4281badb-c6cc-43ea-a6ca-b793deb946a5'
  and display_name ilike 'Life Life%';

update public.labs
set name = 'Lifeline Clinical Laboratory',
    updated_at = now()
where organization_id = '4281badb-c6cc-43ea-a6ca-b793deb946a5'
  and name ilike 'Life Life%';
