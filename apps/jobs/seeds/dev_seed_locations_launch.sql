-- dev_seed_locations_launch.sql
-- APENAS para desenvolvimento: uma amostra das localidades de referência
-- FR/BE/LU (produção recebe a lista completa pelas migrações
-- 20261022210000_z_jobs_locations_*). Mesmo formato, mesmos códigos.

insert into locations (country_code, official_code, city, alt_name, admin_area, postal_code, population, search_key) values
  ('FR', 'FR-75056', 'Paris', null, 'Paris (75)', '75001', 2103778, 'paris'),
  ('FR', 'FR-69123', 'Lyon', null, 'Rhône (69)', '69001', 519127, 'lyon'),
  ('FR', 'FR-74119', 'Évian-les-Bains', null, 'Haute-Savoie (74)', '74500', 9267, 'evian les bains'),
  ('FR', 'FR-74281', 'Thonon-les-Bains', null, 'Haute-Savoie (74)', '74200', 37928, 'thonon les bains'),
  ('BE', 'BE-21004', 'Bruxelles', 'Brussel', 'Région de Bruxelles-Capitale', '1000', null, 'bruxelles | brussel'),
  ('BE', 'BE-62063', 'Liège', 'Luik', 'Province de Liège', '4000', null, 'liege | luik'),
  ('LU', 'LU-luxembourg', 'Luxembourg', null, 'Canton de Luxembourg', null, null, 'luxembourg'),
  ('LU', 'LU-esch-sur-alzette', 'Esch-sur-Alzette', null, 'Canton d''Esch-sur-Alzette', null, null, 'esch sur alzette')
on conflict (country_code, official_code) where official_code is not null do nothing;
