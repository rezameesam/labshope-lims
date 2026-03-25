CREATE OR REPLACE FUNCTION public.get_dashboard_overview_stats(
  p_organization_id uuid
)
RETURNS TABLE (
  employees bigint,
  patients bigint,
  tests bigint,
  pending_tests bigint,
  in_progress_tests bigint,
  completed_today bigint,
  tests_yesterday bigint,
  new_patients_today bigint,
  new_patients_yesterday bigint,
  new_patients_this_week bigint,
  total_revenue numeric,
  revenue_today numeric,
  revenue_yesterday numeric,
  revenue_this_week numeric,
  revenue_this_month numeric,
  outstanding_dues numeric,
  paid_invoices bigint,
  pending_invoices bigint
) AS $$
  WITH bounds AS (
    SELECT
      date_trunc('day', now()) AS today_start,
      date_trunc('day', now()) + interval '1 day' AS tomorrow_start,
      date_trunc('day', now()) - interval '1 day' AS yesterday_start,
      now() - interval '7 days' AS week_ago,
      now() - interval '30 days' AS month_ago
  ),
  patient_stats AS (
    SELECT
      count(*)::bigint AS patients,
      count(*) FILTER (
        WHERE p.created_at >= b.today_start
          AND p.created_at < b.tomorrow_start
      )::bigint AS new_patients_today,
      count(*) FILTER (
        WHERE p.created_at >= b.yesterday_start
          AND p.created_at < b.today_start
      )::bigint AS new_patients_yesterday,
      count(*) FILTER (
        WHERE p.created_at >= b.week_ago
      )::bigint AS new_patients_this_week
    FROM public.patients p
    CROSS JOIN bounds b
    WHERE p.organization_id = p_organization_id
  ),
  test_stats AS (
    SELECT
      count(*)::bigint AS tests,
      count(*) FILTER (WHERE pt.status = 'pending')::bigint AS pending_tests,
      count(*) FILTER (WHERE pt.status = 'in_progress')::bigint AS in_progress_tests,
      count(*) FILTER (
        WHERE pt.status = 'completed'
          AND pt.updated_at >= b.today_start
          AND pt.updated_at < b.tomorrow_start
      )::bigint AS completed_today,
      count(*) FILTER (
        WHERE pt.test_date >= b.yesterday_start::date
          AND pt.test_date < b.today_start::date
      )::bigint AS tests_yesterday
    FROM public.patient_tests pt
    CROSS JOIN bounds b
    WHERE pt.organization_id = p_organization_id
  ),
  invoice_stats AS (
    SELECT
      coalesce(sum(i.final_amount), 0)::numeric AS total_revenue,
      coalesce(sum(i.final_amount - i.paid_amount), 0)::numeric AS outstanding_dues,
      coalesce(sum(i.paid_amount) FILTER (
        WHERE i.created_at >= b.today_start
          AND i.created_at < b.tomorrow_start
      ), 0)::numeric AS revenue_today,
      coalesce(sum(i.paid_amount) FILTER (
        WHERE i.created_at >= b.yesterday_start
          AND i.created_at < b.today_start
      ), 0)::numeric AS revenue_yesterday,
      coalesce(sum(i.paid_amount) FILTER (
        WHERE i.created_at >= b.week_ago
      ), 0)::numeric AS revenue_this_week,
      coalesce(sum(i.paid_amount) FILTER (
        WHERE i.created_at >= b.month_ago
      ), 0)::numeric AS revenue_this_month,
      count(*) FILTER (WHERE i.paid_amount >= i.final_amount)::bigint AS paid_invoices,
      count(*) FILTER (WHERE i.paid_amount < i.final_amount)::bigint AS pending_invoices
    FROM public.invoices i
    CROSS JOIN bounds b
    WHERE i.organization_id = p_organization_id
  )
  SELECT
    (SELECT count(*)::bigint FROM public.employees e WHERE e.organization_id = p_organization_id) AS employees,
    ps.patients,
    ts.tests,
    ts.pending_tests,
    ts.in_progress_tests,
    ts.completed_today,
    ts.tests_yesterday,
    ps.new_patients_today,
    ps.new_patients_yesterday,
    ps.new_patients_this_week,
    ists.total_revenue,
    ists.revenue_today,
    ists.revenue_yesterday,
    ists.revenue_this_week,
    ists.revenue_this_month,
    GREATEST(ists.outstanding_dues, 0)::numeric AS outstanding_dues,
    ists.paid_invoices,
    ists.pending_invoices
  FROM patient_stats ps
  CROSS JOIN test_stats ts
  CROSS JOIN invoice_stats ists;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;
