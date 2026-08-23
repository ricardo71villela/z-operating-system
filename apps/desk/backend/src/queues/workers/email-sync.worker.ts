import { Worker } from 'bullmq';
import { redisConnection, EMAIL_SYNC_QUEUE, emailSyncQueue, aiTriageQueue } from '../queues';
import { supabaseAdmin } from '../../supabase/supabase-admin';
import { listRecentGmailMessages, getGmailMessage } from '../../email/gmail.client';
import { listRecentGraphMessages } from '../../email/microsoft-graph.client';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // TODO: replace with Gmail push (Pub/Sub) + Graph webhooks; polling is a v1 shortcut

export function scheduleEmailSyncPolling() {
  emailSyncQueue.add(
    'poll-and-fanout',
    {},
    { repeat: { every: POLL_INTERVAL_MS }, jobId: 'email-sync-poll' },
  );
}

/**
 * Each tick: loads every active gmail/microsoft desk_integrations row and
 * syncs it in turn. Sequential on purpose for the foundation branch — fine
 * at low tenant counts, but should fan out to per-integration jobs once
 * volume grows instead of one worker walking the whole list.
 *
 * TOKEN REFRESH TODO: oauth_tokens.expiresAt is never checked here — a
 * token refresh flow (using refreshToken against Google/Microsoft's token
 * endpoint) is required before this can run unattended for more than an
 * access-token lifetime (~1h for both providers).
 */
export const emailSyncWorker = new Worker(
  EMAIL_SYNC_QUEUE,
  async () => {
    const { data: integrations, error } = await supabaseAdmin
      .from('desk_integrations')
      .select('id, tenant_id, provider, external_account_id, oauth_tokens, sync_state')
      .in('provider', ['gmail', 'microsoft'])
      .eq('status', 'active');

    if (error) throw error;

    for (const integration of integrations ?? []) {
      try {
        if (integration.provider === 'gmail') {
          await syncGmailIntegration(integration);
        } else {
          await syncMicrosoftIntegration(integration);
        }
      } catch (err) {
        console.error(`Falha ao sincronizar integração ${integration.id} (${integration.provider}):`, err);
      }
    }
  },
  { connection: redisConnection },
);

async function syncGmailIntegration(integration: any) {
  const accessToken = integration.oauth_tokens?.accessToken;
  if (!accessToken) return;

  const { messages, newHistoryId } = await listRecentGmailMessages(
    accessToken,
    integration.sync_state?.historyId,
  );

  for (const summary of messages) {
    const detail = await getGmailMessage(accessToken, summary.id);
    await ingestEmailMessage({
      tenantId: integration.tenant_id,
      externalThreadId: detail.threadId,
      fromEmail: detail.fromEmail,
      fromName: detail.fromName,
      subject: detail.subject,
      body: detail.bodyText,
      receivedAt: detail.receivedAt,
    });
  }

  await supabaseAdmin
    .from('desk_integrations')
    .update({ sync_state: { historyId: newHistoryId } })
    .eq('id', integration.id);
}

async function syncMicrosoftIntegration(integration: any) {
  const accessToken = integration.oauth_tokens?.accessToken;
  if (!accessToken) return;

  const { messages, newDeltaLink } = await listRecentGraphMessages(
    accessToken,
    integration.sync_state?.deltaLink,
  );

  for (const message of messages) {
    await ingestEmailMessage({
      tenantId: integration.tenant_id,
      externalThreadId: message.conversationId,
      fromEmail: message.fromEmail,
      fromName: message.fromName,
      subject: message.subject,
      body: message.bodyText,
      receivedAt: message.receivedAt,
    });
  }

  await supabaseAdmin
    .from('desk_integrations')
    .update({ sync_state: { deltaLink: newDeltaLink } })
    .eq('id', integration.id);
}

interface NormalizedEmail {
  tenantId: string;
  externalThreadId: string;
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  body: string;
  receivedAt: string;
}

async function ingestEmailMessage(email: NormalizedEmail) {
  const { data: contact, error: contactError } = await supabaseAdmin
    .from('desk_contacts')
    .upsert(
      { tenant_id: email.tenantId, email: email.fromEmail, display_name: email.fromName },
      { onConflict: 'tenant_id,email' },
    )
    .select()
    .single();
  if (contactError) throw contactError;

  const { data: thread, error: threadError } = await supabaseAdmin
    .from('desk_threads')
    .upsert(
      {
        tenant_id: email.tenantId,
        contact_id: contact.id,
        email_thread_id: email.externalThreadId,
        subject: email.subject,
        last_message_at: email.receivedAt,
      },
      { onConflict: 'tenant_id,email_thread_id' },
    )
    .select()
    .single();
  if (threadError) throw threadError;

  const { data: message, error: messageError } = await supabaseAdmin
    .from('desk_messages')
    .insert({
      tenant_id: email.tenantId,
      thread_id: thread.id,
      channel: 'email',
      direction: 'inbound',
      body: email.body,
      received_at: email.receivedAt,
      state: 'pending_decision',
    })
    .select()
    .single();
  if (messageError) throw messageError;

  await supabaseAdmin
    .from('desk_contacts')
    .update({
      thread_count: (contact.thread_count ?? 0) + 1,
      last_interaction_at: email.receivedAt,
    })
    .eq('id', contact.id);

  await aiTriageQueue.add('triage', { messageId: message.id, tenantId: email.tenantId });
}
