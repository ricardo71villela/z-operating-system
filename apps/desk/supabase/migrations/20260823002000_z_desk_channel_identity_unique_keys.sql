-- Z Desk — unique keys required for idempotent contact/thread upserts
-- (tenant resolution work). Partial unique indexes because a contact/thread
-- may legitimately have only one of the two channel identifiers.

create unique index if not exists uq_desk_contacts_tenant_whatsapp
  on desk_contacts(tenant_id, whatsapp_number)
  where whatsapp_number is not null;

create unique index if not exists uq_desk_contacts_tenant_email
  on desk_contacts(tenant_id, email)
  where email is not null;

create unique index if not exists uq_desk_threads_tenant_whatsapp_chat
  on desk_threads(tenant_id, whatsapp_chat_id)
  where whatsapp_chat_id is not null;

create unique index if not exists uq_desk_threads_tenant_email_thread
  on desk_threads(tenant_id, email_thread_id)
  where email_thread_id is not null;

create unique index if not exists uq_desk_integrations_provider_account
  on desk_integrations(provider, external_account_id);
