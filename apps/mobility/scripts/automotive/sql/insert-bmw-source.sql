insert into public.automotive_data_sources (
  code,
  name,
  website_url,
  source_type,
  priority,
  active
)
values (
  'bmw_pressclub',
  'BMW Official Sources',
  'https://www.bmw.pt',
  'manufacturer',
  1,
  true
)
on conflict (code)
do update set
  name = excluded.name,
  website_url = excluded.website_url,
  source_type = excluded.source_type,
  priority = excluded.priority,
  active = excluded.active,
  updated_at = now();
