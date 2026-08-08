-- dev_seed_geography.sql
-- APENAS para ambiente de desenvolvimento. Nunca correr em produção.
-- Países e idiomas iniciais (secção 14).
--
-- Estendido para incluir Itália e Alemanha — bloco de lançamento UE
-- decidido nas discussões de produto (PT/IT/ES/FR na vaga 1-2, DE na
-- vaga 3). Sem isto, o schema estava desatualizado face à decisão real.

insert into countries (code, name, default_locale, default_currency) values
  ('PT', 'Portugal', 'pt-PT', 'EUR'),
  ('ES', 'Espanha', 'es-ES', 'EUR'),
  ('FR', 'França', 'fr-FR', 'EUR'),
  ('IT', 'Itália', 'it-IT', 'EUR'),
  ('DE', 'Alemanha', 'de-DE', 'EUR'),
  ('BE', 'Bélgica', 'fr-BE', 'EUR'),
  ('LU', 'Luxemburgo', 'fr-LU', 'EUR')
on conflict (code) do nothing;

insert into locales (code, name) values
  ('pt', 'Português'),
  ('en', 'English'),
  ('fr', 'Français'),
  ('es', 'Español'),
  ('it', 'Italiano'),
  ('de', 'Deutsch')
on conflict (code) do nothing;

insert into locations (country_code, admin_area, city) values
  ('PT', 'Lisboa', 'Lisboa'),
  ('PT', 'Porto', 'Porto'),
  ('ES', 'Madrid', 'Madrid'),
  ('FR', 'Île-de-France', 'Paris'),
  ('IT', 'Lombardia', 'Milão'),
  ('IT', 'Lazio', 'Roma'),
  ('DE', 'Berlin', 'Berlim'),
  ('BE', 'Bruxelles-Capitale', 'Bruxelas'),
  ('LU', 'Luxembourg', 'Luxemburgo (cidade)')
on conflict do nothing;
