create or replace function public.get_public_organization_context(
  _domain text default null,
  _slug text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with domain_org as (
    select o.*
    from public.organization_domains od
    join public.organizations o on o.id = od.organization_id
    where coalesce(nullif(btrim(_domain), ''), '') <> ''
      and lower(od.domain) = lower(btrim(_domain))
      and o.status in ('trial', 'active')
    order by od.is_primary desc, od.created_at asc
    limit 1
  ),
  slug_org as (
    select o.*
    from public.organizations o
    where not exists (select 1 from domain_org)
      and coalesce(nullif(btrim(_slug), ''), '') <> ''
      and lower(o.slug) = lower(btrim(_slug))
      and o.status in ('trial', 'active')
    order by o.created_at asc
    limit 1
  ),
  chosen_org as (
    select * from domain_org
    union all
    select * from slug_org
  ),
  chosen_lab as (
    select l.*
    from public.labs l
    join chosen_org o on o.id = l.organization_id
    where l.is_active = true
    order by case when l.type = 'main' then 0 else 1 end, l.created_at asc
    limit 1
  ),
  chosen_settings as (
    select os.setting_key, os.setting_value
    from public.organization_settings os
    join chosen_org o on o.id = os.organization_id
    where os.setting_key in (
      'branding_tagline',
      'branding_description',
      'branding_established_year',
      'organization_website',
      'report_tagline',
      'report_footer_note',
      'report_default_header_template',
      'report_default_footer_template',
      'notification_follow_up_title',
      'notification_follow_up_message',
      'notification_checkup_title',
      'notification_checkup_message',
      'notification_payment_title',
      'notification_payment_message',
      'notification_test_result_title',
      'notification_test_result_message',
      'notification_custom_title',
      'notification_custom_message'
    )
  )
  select case
    when exists (select 1 from chosen_org) then jsonb_build_object(
      'organization',
      (
        select to_jsonb(org_row)
        from (
          select
            id,
            slug,
            display_name,
            legal_name,
            status,
            primary_email,
            primary_phone,
            billing_email,
            logo_url,
            favicon_url,
            metadata
          from chosen_org
        ) as org_row
      ),
      'primary_lab',
      (
        select to_jsonb(lab_row)
        from (
          select
            id,
            organization_id,
            name,
            type,
            address,
            city,
            state,
            pincode,
            phone,
            email,
            logo_url,
            settings
          from chosen_lab
        ) as lab_row
      ),
      'settings',
      coalesce(
        (
          select jsonb_object_agg(setting_key, setting_value)
          from chosen_settings
        ),
        '{}'::jsonb
      )
    )
    else null::jsonb
  end;
$$;
