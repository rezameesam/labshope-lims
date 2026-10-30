-- Two more names that can never become a lab: the hostname the desktop app installers are served from
-- (lims-downloads.labshope.com, a Cloudflare R2 bucket) and RadarX's equivalent. Any <name>.labshope.com is
-- otherwise treated as a lab called <name>.
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
                 'learn', 'legal', 'lims', 'lims-downloads', 'linkedin', 'localhost', 'login', 'logo', 'logs',
                 'mail', 'main', 'market', 'marketplace', 'media', 'metrics', 'microsoft', 'mobile',
                 'monitor', 'news', 'newsletter', 'noreply', 'null', 'official', 'online', 'order',
                 'orders', 'partner', 'partners', 'patient', 'patients', 'payment', 'payments', 'paypal',
                 'plan', 'plans', 'platform', 'policy', 'portal', 'postmaster', 'premium', 'press',
                 'preview', 'price', 'prices', 'pricing', 'privacy', 'private', 'prod', 'production',
                 'public', 'radarx', 'radarx-downloads', 'razorpay', 'refund', 'register', 'registration', 'report', 'reports',
                 'result', 'results', 'root', 'sales', 'sample', 'samples', 'sandbox', 'search',
                 'secure', 'security', 'service', 'services', 'setup', 'shop', 'shops', 'signin',
                 'signup', 'site', 'sites', 'smtp', 'solutions', 'staff', 'staging', 'start',
                 'starter', 'static', 'status', 'store', 'stores', 'stripe', 'supabase', 'support',
                 'survey', 'system', 'team', 'terms', 'test', 'tests', 'training', 'trial',
                 'tutorial', 'twitter', 'undefined', 'unsubscribe', 'update', 'updates', 'upload', 'uploads',
                 'verified', 'verify', 'wallet', 'webmail', 'webmaster', 'website', 'welcome', 'whatsapp',
                 'world', 'youtube']
$$;
