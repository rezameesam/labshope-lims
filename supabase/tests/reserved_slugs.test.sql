-- Reserved site names can't become labs (run with all migrations applied; rolled back at the end):
--   psql "$DATABASE_URL" -f supabase/tests/reserved_slugs.test.sql
\set ON_ERROR_STOP on
begin;

-- a normal lab is fine (4+ letters, not a reserved word)
insert into organizations (id, slug, display_name) values
  ('22222222-2222-2222-2222-222222222201', 'okay-lab', 'Okay Lab');

-- reserved slugs are refused, in any case
do $$
declare blocked int := 0; name text;
begin
  foreach name in array array['lims','healthcare','LIMS','Healthcare','www','lab','shop','business','email','site','contact','ab','x','12','abc','1234','-abcd','abc-'] loop
    begin
      insert into organizations (slug, display_name) values (name, 'x');
    exception when check_violation then blocked := blocked + 1;
    end;
  end loop;
  if blocked <> 18 then raise exception 'expected 18 blocked slugs, got %', blocked; end if;
end $$;

-- renaming a lab to a reserved name is refused too
do $$
begin
  begin
    update organizations set slug = 'healthcare' where slug = 'okay-lab';
    raise exception 'rename to a reserved slug was allowed';
  exception when check_violation then null;
  end;
end $$;

-- unrelated updates on an existing lab still work
update organizations set display_name = 'Okay Lab 2' where slug = 'okay-lab';

-- reserved addresses on our domain are refused; a lab's own domain and normal labs are fine
do $$
declare org uuid := '22222222-2222-2222-2222-222222222201';
begin
  begin
    insert into organization_domains (organization_id, domain) values (org, 'healthcare.labshope.com');
    raise exception 'reserved address was allowed';
  exception when check_violation then null;
  end;
  insert into organization_domains (organization_id, domain) values (org, 'okay-lab.labshope.com');
  insert into organization_domains (organization_id, domain) values (org, 'lims.okaylab.example');
end $$;

select 'reserved_slugs: all checks passed' as result;
rollback;
