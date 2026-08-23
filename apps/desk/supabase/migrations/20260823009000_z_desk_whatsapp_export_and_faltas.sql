-- Z Desk — ADR-0007: WhatsApp schedule export + falta types

alter table desk_users add column if not exists whatsapp_number text;

alter table desk_absences drop constraint if exists desk_absences_type_check;
alter table desk_absences add constraint desk_absences_type_check
  check (type in ('vacation', 'sick', 'other', 'falta_justificada', 'falta_injustificada'));
