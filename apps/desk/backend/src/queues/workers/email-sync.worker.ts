import { Worker } from 'bullmq';
import { redisConnection, EMAIL_SYNC_QUEUE, emailSyncQueue, aiTriageQueue } from '../queues';
import { deskAdmin } from '../../supabase/supabase-admin';
import { listRecentGmailMessages, getGmailMessage } from '../../email/gmail.client';
import { listRecentGraphMessages } from '../../email/microsoft-graph.client';
import type { ActiveDeskIntegration } from '../../integrations-security/integration-credential.service';
import { accessTokenForWorker, listActiveWorkerIntegrations, updateWorkerSyncState } from '../worker-credentials';

const POLL_INTERVAL_MS = 5 * 60 * 1000;

export function scheduleEmailSyncPolling() {
  return emailSyncQueue.add(
    'poll-and-fanout',
    {},
    { repeat: { every: POLL_INTERVAL_MS }, jobId: 'email-sync-poll' },
  );
}

export const emailSyncWorker = new Worker(
  EMAIL_SYNC_QUEUE,
  async () => {
    const integrations = await listActiveWorkerIntegrations(['gmail', 'microsoft']);

    for (const integration of integrations) {
      try {
        if (integration.provider === 'gmail') {
          await syncGmailIntegration(integration);
        } else if (integration.provider === 'microsoft') {
          await syncMicrosoftIntegration(integration);
        }
      } catch (err) {
        console.error(`Falha ao sincronizar integração ${integration.id} (${integration.provider}):`, err);
      }
    }
  },
  { connection: redisConnection },
);

async function syncGmailIntegration(integration: ActiveDeskIntegration) {
  const accessToken = await accessTokenForWorker(integration);
  const historyId = typeof integration.syncState.historyId === 'string' ? integration.syncState.historyId : undefined;
  const { messages, newHistoryId } = await listRecentGmailMessages(accessToken, historyId);

  for (const summary of messages) {
    const detail = await getGmailMessage(accessToken, summary.id);
    await ingestEmailMessage({
      workspaceId: integration.workspaceId,
      externalMessageId: detail.id,
      externalThreadId: detail.threadId,
      fromEmail: detail.fromEmail,
      fromName: detail.fromName,
      subject: detail.subject,
      body: detail.bodyText,
      receivedAt: detail.receivedAt,
    });
  }

  await updateWorkerSyncState(integration, { ...integration.syncState, historyId: newHistoryId });
}

async function syncMicrosoftIntegration(integration: ActiveDeskIntegration) {
  const accessToken = await accessTokenForWorker(integration);
  const deltaLink = typeof integration.syncState.deltaLink === 'string' ? integration.syncState.deltaLink : undefined;
  const { messages, newDeltaLink } = await listRecentGraphMessages(accessToken, deltaLink);

  for (const message of messages) {
    await ingestEmailMessage({
      workspaceId: integration.workspaceId,
      externalMessageId: message.id,
      externalThreadId: message.conversationId,
      fromEmail: message.fromEmail,
      fromName: message.fromName,
      subject: message.subject,
      body: message.bodyText,
      receivedAt: message.receivedAt,
    });
  }

  await updateWorkerSyncState(integration, { ...integration.syncState, deltaLink: newDeltaLink });
}

interface NormalizedEmail {
  workspaceId: string;
  externalMessageId: string;
  externalThreadId: string;
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  body: string;
  receivedAt: string;
}

async function ingestEmailMessage(email: NormalizedEmail) {
  if (!email.fromEmail || !email.externalMessageId || !email.externalThreadId) return;

  const { data: contact, error: contactError } = await deskAdmin
    .from('contacts')
    .upsert(
      { workspace_id: email.workspaceId, email: email.fromEmail, display_name: email.fromName },
      { onConflict: 'workspace_id,email' },
    )
    .select()
    .single();
  if (contactError) throw contactError;

  const { data: thread, error: threadError } = await deskAdmin
    .from('threads')
    .upsert(
      {
        workspace_id: email.workspaceId,
        contact_id: contact.id,
        email_thread_id: email.externalThreadId,
        subject: email.subject,
        last_message_at: email.receivedAt,
      },
      { onConflict: 'workspace_id,email_thread_id' },
    )
    .select()
    .single();
  if (threadError) throw threadError;

  const { data: message, error: messageError } = await deskAdmin
    .from('messages')
    .insert({
      workspace_id: email.workspaceId,
      thread_id: thread.id,
      channel: 'email',
      direction: 'inbound',
      external_message_id: email.externalMessageId,
      body: email.body,
      received_at: email.receivedAt,
      state: 'pending_decision',
    })
    .select()
    .single();

  if (messageError?.code === '23505') return;
  if (messageError) throw messageError;

  await deskAdmin
    .from('contacts')
    .update({
      thread_count: (contact.thread_count ?? 0) + 1,
      last_interaction_at: email.receivedAt,
    })
    .eq('id', contact.id)
    .eq('workspace_id', email.workspaceId);

  await aiTriageQueue.add(
    'triage',
    { messageId: message.id, workspaceId: email.workspaceId },
    { jobId: `triage:${message.id}` },
  );
}
