-- ============================================================
-- Z FIND — MIGRATION 0012 — Geography Bridge
-- ============================================================
-- zones_lite remains the marketplace/search tag used by current UI. This
-- optional reference allows it to bind to canonical Geography without
-- pretending Zone Lite is itself the full Geography model.
-- ============================================================

alter table zones_lite add column geography_entity_id text;
alter table zones_lite add column geography_binding_status text not null default 'unbound'
  check (geography_binding_status in ('unbound','linked','superseded'));
create unique index uq_zones_lite_geography_entity_id on zones_lite(geography_entity_id) where geography_entity_id is not null;

comment on column zones_lite.geography_entity_id is 'Optional canonical Geography reference. zones_lite remains a lightweight marketplace projection.';
