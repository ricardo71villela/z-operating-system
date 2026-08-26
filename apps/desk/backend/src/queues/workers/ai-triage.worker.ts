import { Worker } from 'bullmq';
import { redisConnection, AI_TRIAGE_QUEUE } from '../queues';
import { deskAdmin } from '../../supabase/supabase-admin';
import { runDeskAiTriage } from '../../ai/desk-ai.client';

interface AiTriageJob {
  messageId: string;
  workspaceId: string;
}

/**
 * AI triage is opt-in and human-in-the-loop. It may summarize, prioritize and
 * create a draft event suggestion, but it never confirms or publishes an event.
 */
export const aiTriageWorker = new Worker<AiTriageJob>(
  AI_TRIAGE_QUEUE,
  async (job) => {
    const { messageId, workspaceId } = job.data;

    const { data: workspace, error: workspaceError } = await deskAdmin
      .from('workspaces')
      .select('id,ai_triage_enabled')
      .eq('id', workspaceId)
      .eq('status', 'active')
      .maybeSingle();
    if (workspaceError) throw workspaceError;
    if (!workspace?.ai_triage_enabled) {
      await writeAudit(workspaceId, messageId, 'disabled', 'skipped', '', 0, 0);
      return;
    }

    const { data: message, error } = await deskAdmin
      .from('messages')
      .select('id,thread_id,body,workspace_id,ai_triaged_at')
      .eq('id', messageId)
      .eq('workspace_id', workspaceId)
      .single();
    if (error) throw error;
    if (message.ai_triaged_at) return;

    try {
      const triage = await runDeskAiTriage(message.body ?? '');

      const { error: updateError } = await deskAdmin
        .from('messages')
        .update({
          ai_summary: triage.summary,
          ai_priority: triage.priority,
          ai_triaged_at: new Date().toISOString(),
          ai_model: triage.model,
        })
        .eq('id', messageId)
        .eq('workspace_id', workspaceId);
      if (updateError) throw updateError;

      if (triage.meetingIntent) {
        const { error: eventError } = await deskAdmin.from('events').insert({
          workspace_id: workspaceId,
          thread_id: message.thread_id,
          title: triage.meetingIntent.title,
          starts_at: triage.meetingIntent.startsAt,
          ends_at: triage.meetingIntent.endsAt,
          source: 'ai_suggested',
          status: 'draft',
          confidence_score: triage.meetingIntent.confidence,
        });
        if (eventError) throw eventError;
      }

      await writeAudit(
        workspaceId,
        messageId,
        triage.model,
        'completed',
        null,
        triage.inputChars,
        triage.outputChars,
      );
    } catch (error) {
      await writeAudit(
        workspaceId,
        messageId,
        'unavailable',
        'failed',
        String((error as Error)?.message || error).slice(0, 300),
        String(message.body ?? '').slice(0, 6000).length,
        0,
      );
      throw error;
    }
  },
  { connection: redisConnection },
);

async function writeAudit(
  workspaceId: string,
  messageId: string,
  model: string,
  outcome: 'completed' | 'failed' | 'skipped',
  reason: string | null,
  inputChars: number,
  outputChars: number,
) {
  const { error } = await deskAdmin.from('ai_triage_audit').insert({
    workspace_id: workspaceId,
    message_id: messageId,
    model,
    outcome,
    reason,
    input_chars: inputChars,
    output_chars: outputChars,
  });
  if (error) throw error;
}
