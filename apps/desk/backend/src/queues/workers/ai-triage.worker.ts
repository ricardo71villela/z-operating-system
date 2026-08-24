import { Worker } from 'bullmq';
import { redisConnection, AI_TRIAGE_QUEUE } from '../queues';
import { deskAdmin } from '../../supabase/supabase-admin';

interface AiTriageJob {
  messageId: string;
  workspaceId: string;
}

/**
 * AI triage remains human-in-the-loop: it may summarize, prioritize and
 * create a draft event suggestion, but it never confirms an event.
 */
export const aiTriageWorker = new Worker<AiTriageJob>(
  AI_TRIAGE_QUEUE,
  async (job) => {
    const { messageId, workspaceId } = job.data;

    const { data: message, error } = await deskAdmin
      .from('messages')
      .select('id,thread_id,body,workspace_id')
      .eq('id', messageId)
      .eq('workspace_id', workspaceId)
      .single();

    if (error) throw error;

    const triage = await runTriage(message.body ?? '');

    const { error: updateError } = await deskAdmin
      .from('messages')
      .update({ ai_summary: triage.summary, ai_priority: triage.priority })
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
  },
  { connection: redisConnection },
);

interface TriageResult {
  summary: string;
  priority: 'low' | 'normal' | 'high';
  meetingIntent: {
    title: string;
    startsAt: string;
    endsAt: string;
    confidence: number;
  } | null;
}

/**
 * Placeholder only. D4 will connect this to the approved ZOS AI authority;
 * no provider call or autonomous action is introduced in D3.
 */
async function runTriage(_body: string): Promise<TriageResult> {
  return { summary: '', priority: 'normal', meetingIntent: null };
}
