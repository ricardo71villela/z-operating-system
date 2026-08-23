import { Worker } from 'bullmq';
import { redisConnection, INBOUND_MESSAGE_QUEUE, aiTriageQueue } from '../queues';
import { supabaseAdmin } from '../../supabase/supabase-admin';

interface InboundMessageJob {
  channel: 'email' | 'whatsapp';
  payload: unknown;
  receivedAt: string;
}

/**
 * Normalizes a raw webhook/sync payload into a desk_thread + desk_message row,
 * then hands off to the AI triage queue. Tenant resolution below is a
 * placeholder — real lookup matches the WhatsApp number / e-mail account
 * against desk_integrations.external_account_id.
 */
export const inboundMessageWorker = new Worker<InboundMessageJob>(
  INBOUND_MESSAGE_QUEUE,
  async (job) => {
    const { channel, payload, receivedAt } = job.data;

    // TODO: resolve tenant_id + contact_id from payload against
    // desk_integrations (whatsapp_number / email account) instead of
    // trusting the payload directly.
    const tenantId = extractTenantIdPlaceholder(payload);
    const contactId = null;

    const { data: thread, error: threadError } = await supabaseAdmin
      .from('desk_threads')
      .upsert(
        {
          tenant_id: tenantId,
          contact_id: contactId,
          last_message_at: receivedAt,
        },
        { onConflict: 'id' },
      )
      .select()
      .single();

    if (threadError) throw threadError;

    const { data: message, error: messageError } = await supabaseAdmin
      .from('desk_messages')
      .insert({
        tenant_id: tenantId,
        thread_id: thread.id,
        channel,
        direction: 'inbound',
        body: extractBodyPlaceholder(channel, payload),
        received_at: receivedAt,
      })
      .select()
      .single();

    if (messageError) throw messageError;

    await aiTriageQueue.add('triage', { messageId: message.id, tenantId });
  },
  { connection: redisConnection },
);

function extractTenantIdPlaceholder(_payload: unknown): string {
  throw new Error(
    'Tenant resolution not implemented — match inbound account against desk_integrations before enabling this worker.',
  );
}

function extractBodyPlaceholder(channel: 'email' | 'whatsapp', _payload: unknown): string {
  return channel === 'whatsapp' ? '' : '';
}
