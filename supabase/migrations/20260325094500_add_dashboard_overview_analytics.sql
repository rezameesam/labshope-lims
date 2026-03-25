CREATE OR REPLACE FUNCTION public.get_dashboard_overview_analytics(
  p_organization_id uuid
)
RETURNS TABLE (
  top_tests jsonb,
  revenue_trends jsonb,
  test_trends jsonb
) AS $$
  WITH day_series AS (
    SELECT generate_series(
      current_date - interval '6 days',
      current_date,
      interval '1 day'
    )::date AS day_date
  ),
  top_tests_data AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'test_name', ranked.test_name,
          'count', ranked.test_count,
          'revenue', ranked.revenue
        )
        ORDER BY ranked.revenue DESC, ranked.test_name ASC
      ),
      '[]'::jsonb
    ) AS payload
    FROM (
      SELECT
        ii.test_name,
        count(*)::int AS test_count,
        coalesce(sum(ii.amount), 0)::numeric AS revenue
      FROM public.invoice_items ii
      INNER JOIN public.invoices i
        ON i.id = ii.invoice_id
      WHERE ii.organization_id = p_organization_id
        AND i.organization_id = p_organization_id
      GROUP BY ii.test_name
      ORDER BY revenue DESC, ii.test_name ASC
      LIMIT 5
    ) ranked
  ),
  revenue_trends_data AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'date', to_char(ds.day_date, 'Dy'),
          'revenue', coalesce(day_totals.revenue, 0),
          'paid', coalesce(day_totals.paid, 0),
          'pending', coalesce(day_totals.revenue, 0) - coalesce(day_totals.paid, 0)
        )
        ORDER BY ds.day_date
      ),
      '[]'::jsonb
    ) AS payload
    FROM day_series ds
    LEFT JOIN (
      SELECT
        date(i.created_at) AS created_day,
        coalesce(sum(i.final_amount), 0)::numeric AS revenue,
        coalesce(sum(i.paid_amount), 0)::numeric AS paid
      FROM public.invoices i
      WHERE i.organization_id = p_organization_id
        AND i.created_at >= current_date - interval '6 days'
        AND i.created_at < current_date + interval '1 day'
      GROUP BY date(i.created_at)
    ) day_totals
      ON day_totals.created_day = ds.day_date
  ),
  test_trends_data AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'date', to_char(ds.day_date, 'Dy'),
          'tests', coalesce(day_totals.test_count, 0)
        )
        ORDER BY ds.day_date
      ),
      '[]'::jsonb
    ) AS payload
    FROM day_series ds
    LEFT JOIN (
      SELECT
        pt.test_date AS test_day,
        count(*)::int AS test_count
      FROM public.patient_tests pt
      WHERE pt.organization_id = p_organization_id
        AND pt.test_date >= current_date - 6
        AND pt.test_date <= current_date
      GROUP BY pt.test_date
    ) day_totals
      ON day_totals.test_day = ds.day_date
  )
  SELECT
    ttd.payload AS top_tests,
    rtd.payload AS revenue_trends,
    trd.payload AS test_trends
  FROM top_tests_data ttd
  CROSS JOIN revenue_trends_data rtd
  CROSS JOIN test_trends_data trd;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;
