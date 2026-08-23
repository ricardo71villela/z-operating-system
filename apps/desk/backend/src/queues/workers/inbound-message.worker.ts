import { Worker } from 'bullmq';
import { redisConnection, INBOUND_MESSAGE_QUEUE, aiTriageQueue } from '../queues';
import { supabaseAdmin } from '../../supabase/supabase-admin';
import { resolveTenantForWhatsapp, UnknownChannelAccountError } from '../../tenant-resolution/tenant-resolution.service';
import { parseWhatsappMessage } from '../../whatsapp/parse-whatsapp-payload';

interface InboundMessageJob {
  channel: 'email' | 'whatsapp';
  payload: unknown;
  receivedAt: string;
}

/**
 * Normalizes a raw webhook/sync payload into a desk_thread + desk_message
 * row, resolving the owning tenant first, then hands off to AI triage.
 *
 * Email ingestion is not implemented yet — resolveTenantForEmailAccount
 * exists for it, but there is no Gmail/Graph sync producing jobs on this
 * queue with channel='email' yet, so that branch throws explicitly rather
 * than silently doing nothing.
 */
export const inboundMessageWorker = new Worker<InboundMessageJob>(
  INBOUND_MESSAGE_QUEUE,
  async (job) => {
    const { channel, payload } = job.data;

    if (channel !== 'whatsapp') {
      throw new Error(`Ingestão de canal '${channel}' ainda não implementada.`);
    }

    const parsed = parseWhatsappMessage(payload);
    if (!parsed) return; // status callback (sent/delivered/read) — nothing to ingest

    let tenantId: string;
    try {
      tenantId = await resolveTenantForWhatsapp(parsed.phoneNumberId);
    } catch (err) {
      if (err instanceof UnknownChannelAccountError) {
        // Message arrived for a WhatsApp number not (or no longer) connected
        // to any tenant. Not a transient failure — retrying won't help —
        // so log and drop rather than letting BullMQ retry indefinitely.
        console.warn(err.message);
        return;
      }
      throw err;
    }

    const { data: contact, error: contactError } = await supabaseAdmin
      .from('desk_contacts')
      .upsert(
        {
          tenant_id: tenantId,
          whatsapp_number: parsed.waId,
          display_name: parsed.contactName,
        },
        { onConflict: 'tenant_id,whatsapp_number', ignoreDuplicates: false },
      )
      .select()
      .single();

    if (contactError) throw contactError;

    const { data: thread, error: threadError } = await supabaseAdmin
      .from('desk_threads')
      .upsert(
        {
          tenant_id: tenantId,
          contact_id: contact.id,
          whatsapp_chat_id: parsed.waId,
          last_message_at: parsed.timestamp,
        },
        { onConflict: 'tenant_id,whatsapp_chat_id' },
      )
      .select()
      .single();

    if (threadError) throw threadError;

    const { data: message, error: messageError } = await supabaseAdmin
      .from('desk_messages')
      .insert({
        tenant_id: tenantId,
        thread_id: thread.id,
        channel: 'whatsapp',
        direction: 'inbound',
        body: parsed.body,
        received_at: parsed.timestamp,
        state: 'pending_decision',
      })
      .select()
      .single();

    if (messageError) throw messageError;

    // Relationship signal (ADR-0002): cheap running counters now; a proper
    // relationship_tier promotion policy (new → recurring → priority) is
    // still a TODO — this only keeps the raw signals fresh.
    await supabaseAdmin
      .from('desk_contacts')
      .update({
        thread_count: (contact.thread_count ?? 0) + 1,
        last_interaction_at: parsed.timestamp,
      })
      .eq('id', contact.id);

    await aiTriageQueue.add('triage', { messageId: message.id, tenantId });
  },
  { connection: redisConnection },
);
