insert into test_templates (
  name,
  result_format,
  include_normal_range,
  include_abnormal_flag,
  include_notes,
  header_template,
  footer_template,
  is_default
)
select
  'Standard Report Template',
  'table',
  true,
  true,
  true,
  '<p>Accurate, timely reports for better clinical decisions.</p>',
  '<p>Thank you for choosing IRM Clinical Laboratory.</p>',
  case
    when exists (select 1 from test_templates where is_default is true) then false
    else true
  end
where not exists (
  select 1 from test_templates where name = 'Standard Report Template'
);
