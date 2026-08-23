-- Z Desk — calendar sync support (pull external events + avoid duplicate imports)

alter table desk_events drop constraint if exists desk_events_source_check;
alter table desk_events add constraint desk_events_source_check
  check (source in ('manual', 'ai_suggested', 'external_sync'));

create unique index if not exists uq_desk_events_external_calendar_event
  on desk_events(tenant_id, external_calendar_provider, external_calendar_event_id)
  where external_calendar_event_id is not null;
