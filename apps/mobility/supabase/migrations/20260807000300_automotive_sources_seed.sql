insert into public.automotive_data_sources(code, name, website_url, source_type, priority, active)
values
  ('z_mobility_curated', 'Z Mobility Curated Registry', null, 'curated', 10, true),
  ('bmw_pressclub', 'BMW Official Sources', 'https://www.bmw.pt', 'manufacturer', 1, true),
  ('audi_media', 'Audi MediaCenter', 'https://www.audi-mediacenter.com', 'manufacturer', 1, true),
  ('mercedes_media', 'Mercedes-Benz Official Sources', 'https://media.mercedes-benz.com', 'manufacturer', 1, true),
  ('porsche_newsroom', 'Porsche Newsroom', 'https://newsroom.porsche.com', 'manufacturer', 1, true),
  ('nhtsa_vpic', 'NHTSA vPIC', 'https://vpic.nhtsa.dot.gov', 'government', 50, true),
  ('volkswagen_media', 'Volkswagen Newsroom', 'https://www.volkswagen-newsroom.com', 'manufacturer', 1, true),
  ('skoda_storyboard', 'Škoda Storyboard', 'https://www.skoda-storyboard.com', 'manufacturer', 1, true),
  ('seat_media_center', 'SEAT Media Center', 'https://www.seat-mediacenter.com', 'manufacturer', 1, true),
  ('cupra_media', 'CUPRA Media', 'https://www.cupraofficial.com', 'manufacturer', 1, true),
  ('bentley_media', 'Bentley Media', 'https://www.bentleymedia.com', 'manufacturer', 1, true),
  ('lamborghini_media', 'Lamborghini Media', 'https://media.lamborghini.com', 'manufacturer', 1, true)
on conflict (code) do update set
  name = excluded.name,
  website_url = excluded.website_url,
  source_type = excluded.source_type,
  priority = excluded.priority,
  active = excluded.active,
  updated_at = now();
