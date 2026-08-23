-- ============================================================
-- Z Fashion — Product Names & Descriptions v1
-- Shared ZOS database (infrastructure/supabase)
--
-- Mirrors the names/descriptions fields added to product.js: closes a
-- gap promised in MARKETS-AND-I18N.md since the earliest design pass
-- ("Product catalog stores names{lang} and descriptions{lang}") but
-- never actually implemented — flagged during the customer-side audit
-- (2026-08-21) when Search had nothing to search over and the Product
-- Page had no title field. Same `names{lang}` shape Z Find already
-- uses for Geography place names, stored as jsonb rather than a
-- per-locale column set — matches how the rest of this schema treats
-- multilingual text (no per-language columns anywhere else either).
-- ============================================================

alter table fashion.products add column names jsonb not null default '{}'::jsonb;
alter table fashion.products add column descriptions jsonb not null default '{}'::jsonb;

-- France-first, not France-only (MARKETS-AND-I18N.md): every Product
-- must carry a non-empty 'fr' name from day one, mirroring
-- product.js's REQUIRED_NAME_LOCALE check exactly. The DEFAULT above
-- exists only to make the ADD COLUMN itself valid syntax against an
-- empty table — this constraint is what actually enforces the rule
-- going forward, same two-step pattern already used elsewhere in this
-- migration set when a NOT NULL column needs a placeholder default.
alter table fashion.products add constraint fashion_products_require_fr_name check (
  names ? 'fr' and length(trim(both from (names->>'fr'))) > 0
);

comment on column fashion.products.names is 'Mirrors names{lang} in product.js — plain jsonb object keyed by locale code (fr/en/it/es/de/pt), never per-language columns. fr is always present and non-empty (fashion_products_require_fr_name); other locale keys are optional.';
comment on column fashion.products.descriptions is 'Mirrors descriptions{lang} in product.js — same shape as names, entirely optional (no NOT NULL content requirement on any key).';

create index idx_fashion_products_names_gin on fashion.products using gin(names);
