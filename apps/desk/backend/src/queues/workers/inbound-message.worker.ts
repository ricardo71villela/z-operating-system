import { Worker } from 'bullmq';
import { redisConnection, INBOUND_MESSAGE_QUEUE, aiTriageQueue } from '../queues';
import { deskAdmin } from '../../supabase/supabase-admin';
import { resolveWorkspaceForWhatsapp, UnknownChannelAccountError } from '../../tenant-resolution/tenant-resolution.service';
import { parseWhatsappMessage } from '../../whatsapp/parse-whatsapp-payload';

interface InboundMessageJob {
  channel: 'email' | 'whatsapp';
  payload: unknown;
  receivedAt: string;
}

export const inboundMessageWorker = new Worker<InboundMessageJob>(
  INBOUND_MESSAGE_QUEUE,
  async (job) => {
    const { channel, payload } = job.data;

    if (channel !== 'whatsapp') {
      throw new Error(`Ingestão de canal '${channel}' deve usar o worker dedicado do provider.`);
    }

    const parsed = parseWhatsappMessage(payload);
    if (!parsed) return;

    let workspaceId: string;
    try {
      workspaceId = await resolveWorkspaceForWhatsapp(parsed.phoneNumberId);
    } catch (err) {
      if (err instanceof UnknownChannelAccountError) {
        console.warn(err.message);
        return;
      }
      throw err;
    }

    const { data: contact, error: contactError } = await deskAdmin
      .from('contacts')
      .upsert(
        {
          workspace_id: workspaceId,
          whatsapp_number: parsed.waId,
          display_name: parsed.contactName,
        },
        { onConflict: 'workspace_id,whatsapp_number' },
      )
      .select()
      .single();
    if (contactError) throw contactError;

    const { data: thread, error: threadError } = await deskAdmin
      .from('threads')
      .upsert(
        {
          workspace_id: workspaceId,
          contact_id: contact.id,
          whatsapp_chat_id: parsed.waId,
          last_message_at: parsed.timestamp,
        },
        { onConflict: 'workspace_id,whatsapp_chat_id' },
      )
      .select()
      .single();
    if (threadError) throw threadError;

    const { data: message, error: messageError } = await deskAdmin
      .from('messages')
      .insert({
        workspace_id: workspaceId,
        thread_id: thread.id,
        channel: 'whatsapp',
        direction: 'inbound',
        external_message_id: parsed.externalMessageId,
        body: parsed.body,
        received_at: parsed.timestamp,
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
        last_interaction_at: parsed.timestamp,
      })
      .eq('id', contact.id)
      .eq('workspace_id', workspaceId);

    await aiTriageQueue.add(
      'triage',
      { messageId: message.id, workspaceId },
      { jobId: `triage:${message.id}` },
    );
  },
  { connection: redisConnection },
);
