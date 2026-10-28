-- IRM now uses irmclinic.com only. lab.irmclinic.com (its DNS record and Pages custom domain were
-- removed in Cloudflare) no longer needs a row in the tenant domain list.
-- Scoped to IRM's organization id, so it is a no-op on a database without it.
delete from public.organization_domains
where organization_id = '99809454-b99a-47a5-a07b-b71e636ef44b'
  and lower(domain) = 'lab.irmclinic.com';
