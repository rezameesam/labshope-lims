CREATE OR REPLACE FUNCTION public.get_public_organization_context(
  _domain TEXT DEFAULT NULL,
  _slug TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH domain_org AS (
    SELECT o.*
    FROM public.organization_domains od
    JOIN public.organizations o ON o.id = od.organization_id
    WHERE COALESCE(NULLIF(BTRIM(_domain), ''), '') <> ''
      AND lower(od.domain) = lower(BTRIM(_domain))
      AND o.status IN ('trial', 'active')
    ORDER BY od.is_primary DESC, od.created_at ASC
    LIMIT 1
  ),
  slug_org AS (
    SELECT o.*
    FROM public.organizations o
    WHERE NOT EXISTS (SELECT 1 FROM domain_org)
      AND COALESCE(NULLIF(BTRIM(_slug), ''), '') <> ''
      AND lower(o.slug) = lower(BTRIM(_slug))
      AND o.status IN ('trial', 'active')
    ORDER BY o.created_at ASC
    LIMIT 1
  ),
  fallback_org AS (
    SELECT o.*
    FROM public.organizations o
    JOIN public.labs l
      ON l.organization_id = o.id
     AND l.is_active = true
     AND l.type = 'main'
    WHERE NOT EXISTS (SELECT 1 FROM domain_org)
      AND NOT EXISTS (SELECT 1 FROM slug_org)
      AND o.status IN ('trial', 'active')
    ORDER BY l.created_at ASC, o.created_at ASC
    LIMIT 1
  ),
  chosen_org AS (
    SELECT * FROM domain_org
    UNION ALL
    SELECT * FROM slug_org
    UNION ALL
    SELECT * FROM fallback_org
  ),
  chosen_lab AS (
    SELECT l.*
    FROM public.labs l
    JOIN chosen_org o ON o.id = l.organization_id
    WHERE l.is_active = true
    ORDER BY CASE WHEN l.type = 'main' THEN 0 ELSE 1 END, l.created_at ASC
    LIMIT 1
  ),
  chosen_settings AS (
    SELECT os.setting_key, os.setting_value
    FROM public.organization_settings os
    JOIN chosen_org o ON o.id = os.organization_id
    WHERE os.setting_key IN (
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
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM chosen_org) THEN jsonb_build_object(
      'organization',
      (
        SELECT to_jsonb(org_row)
        FROM (
          SELECT
            id,
            slug,
            display_name,
            legal_name,
            status,
            primary_email,
            primary_phone,
            billing_email,
            logo_url,
            metadata
          FROM chosen_org
        ) AS org_row
      ),
      'primary_lab',
      (
        SELECT to_jsonb(lab_row)
        FROM (
          SELECT
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
          FROM chosen_lab
        ) AS lab_row
      ),
      'settings',
      COALESCE(
        (
          SELECT jsonb_object_agg(setting_key, setting_value)
          FROM chosen_settings
        ),
        '{}'::jsonb
      )
    )
    ELSE NULL::jsonb
  END;
$$;
