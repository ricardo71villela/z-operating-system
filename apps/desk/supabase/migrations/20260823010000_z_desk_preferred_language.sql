-- Z Desk — per-person preferred_language, independent of tenant/market.
-- The 6 required languages (fr default, en, es, pt, it, de) are a property
-- of the person, not of the tenant's market — someone in a Portuguese
-- market tenant may still prefer English, and vice-versa.

alter table desk_users add column if not exists preferred_language text not null default 'fr'
  check (preferred_language in ('fr', 'en', 'es', 'pt', 'it', 'de'));
