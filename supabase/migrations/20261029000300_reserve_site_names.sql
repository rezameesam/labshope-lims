-- Lab names that can't be used: our own sites (lims.labshope.com, healthcare.labshope.com, ...),
-- generic words (lab, shop, business, email, site, contact, ...) and well-known brands.
-- A lab name must also be at least 4 characters, start with a letter, and use only letters,
-- digits and hyphens. Enforced here so every path is covered: sign-up, platform admin, scripts.
-- Existing rows are left alone; only new or renamed ones are checked.
-- Keep the list in sync with supabase/functions/_shared/reserved-slugs.ts (a test checks this).

create or replace function public.reserved_org_slugs()
returns text[]
language sql
immutable
as $$
  select array['abdm', 'about', 'abuse', 'account', 'accounts', 'admin', 'administrator', 'alpha',
                 'amazon', 'android', 'apple', 'apps', 'assets', 'auth', 'bank', 'beta',
                 'billing', 'blog', 'book', 'booking', 'brand', 'business', 'career', 'careers',
                 'cart', 'checkout', 'client', 'clients', 'clinic', 'clinics', 'cloud', 'cloudflare',
                 'community', 'company', 'contact', 'contacts', 'corp', 'customer', 'customers', 'dashboard',
                 'data', 'default', 'demo', 'design', 'desktop', 'diagnostic', 'diagnostics', 'digital',
                 'doctor', 'doctors', 'download', 'downloads', 'email', 'emails', 'employee', 'employees',
                 'enterprise', 'example', 'facebook', 'feature', 'features', 'feedback', 'files', 'finance',
                 'find', 'forum', 'free', 'github', 'global', 'google', 'group', 'growth',
                 'guide', 'health', 'healthcare', 'help', 'home', 'hospital', 'hospitals', 'hostmaster',
                 'images', 'imap', 'index', 'india', 'info', 'instagram', 'install', 'internal',
                 'invoice', 'invoices', 'jobs', 'laboratories', 'laboratory', 'labs', 'labshope',
                 'learn', 'legal', 'lims', 'linkedin', 'localhost', 'login', 'logo', 'logs',
                 'mail', 'main', 'market', 'marketplace', 'media', 'metrics', 'microsoft', 'mobile',
                 'monitor', 'news', 'newsletter', 'noreply', 'null', 'official', 'online', 'order',
                 'orders', 'partner', 'partners', 'patient', 'patients', 'payment', 'payments', 'paypal',
                 'plan', 'plans', 'platform', 'policy', 'portal', 'postmaster', 'premium', 'press',
                 'preview', 'price', 'prices', 'pricing', 'privacy', 'private', 'prod', 'production',
                 'public', 'radarx', 'razorpay', 'refund', 'register', 'registration', 'report', 'reports',
                 'result', 'results', 'root', 'sales', 'sample', 'samples', 'sandbox', 'search',
                 'secure', 'security', 'service', 'services', 'setup', 'shop', 'shops', 'signin',
                 'signup', 'site', 'sites', 'smtp', 'solutions', 'staff', 'staging', 'start',
                 'starter', 'static', 'status', 'store', 'stores', 'stripe', 'supabase', 'support',
                 'survey', 'system', 'team', 'terms', 'test', 'tests', 'training', 'trial',
                 'tutorial', 'twitter', 'undefined', 'unsubscribe', 'update', 'updates', 'upload', 'uploads',
                 'verified', 'verify', 'wallet', 'webmail', 'webmaster', 'website', 'welcome', 'whatsapp',
                 'world', 'youtube']
$$;

create or replace function public.org_slug_problem(p_slug text)
returns text
language sql
immutable
as $$
  select case
    when length(coalesce(p_slug, '')) < 4 then 'Lab names need at least 4 characters.'
    when lower(p_slug) !~ '^[a-z][a-z0-9-]*[a-z0-9]$' then 'Use letters, digits and hyphens only, starting with a letter.'
    when lower(p_slug) = any (public.reserved_org_slugs()) then 'That name is reserved. Please choose a different one.'
    else null
  end
$$;

create or replace function public.block_reserved_org_slug()
returns trigger
language plpgsql
as $$
declare
  problem text;
begin
  if tg_op = 'UPDATE' and new.slug is not distinct from old.slug then
    return new;
  end if;
  problem := public.org_slug_problem(new.slug);
  if problem is not null then
    raise exception '%', problem using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_block_reserved_slug on public.organizations;
create trigger organizations_block_reserved_slug
  before insert or update of slug on public.organizations
  for each row
  execute function public.block_reserved_org_slug();

create or replace function public.block_reserved_org_domain()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.domain is not distinct from old.domain then
    return new;
  end if;
  -- Only a lab address on our own domain is checked; a lab's own domain (e.g. irmclinic.com) is fine.
  if lower(new.domain) like '%.labshope.com'
     and public.org_slug_problem(split_part(lower(new.domain), '.', 1)) is not null then
    raise exception 'The address "%" is not available. Please choose a different one.', new.domain
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists organization_domains_block_reserved on public.organization_domains;
create trigger organization_domains_block_reserved
  before insert or update of domain on public.organization_domains
  for each row
  execute function public.block_reserved_org_domain();
