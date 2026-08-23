import { Worker } from 'bullmq';
import { redisConnection, AI_TRIAGE_QUEUE } from '../queues';
import { supabaseAdmin } from '../../supabase/supabase-admin';

interface AiTriageJob {
  messageId: string;
  tenantId: string;
}

/**
 * AI triage: summarizes the message, assigns priority, and — when the
 * message reads as a meeting request — creates a desk_events row with
 * source='ai_suggested', status='draft' and a confidence_score.
 *
 * Per ADR-0001, this worker NEVER sets status='confirmed'. Confirmation is
 * a human action in the UI. confidence_score is persisted regardless, so
 * a future autonomous-confirmation policy can read from it without a
 * schema change.
 */
export const aiTriageWorker = new Worker<AiTriageJob>(
  AI_TRIAGE_QUEUE,
  async (job) => {
    const { messageId, tenantId } = job.data;

    const { data: message, error } = await supabaseAdmin
      .from('desk_messages')
      .select('id, thread_id, body')
      .eq('id', messageId)
      .single();

    if (error) throw error;

    const triage = await runTriage(message.body ?? '');

    await supabaseAdmin
      .from('desk_messages')
      .update({ ai_summary: triage.summary, ai_priority: triage.priority })
      .eq('id', messageId);

    if (triage.meetingIntent) {
      await supabaseAdmin.from('desk_events').insert({
        tenant_id: tenantId,
        thread_id: message.thread_id,
        title: triage.meetingIntent.title,
        starts_at: triage.meetingIntent.startsAt,
        ends_at: triage.meetingIntent.endsAt,
        source: 'ai_suggested',
        status: 'draft',
        confidence_score: triage.meetingIntent.confidence,
      });
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
 * TODO: replace with a real call to the Claude API (summarization + meeting
 * intent extraction via function calling, per the architecture agreed in
 * chat). Placeholder keeps the pipeline runnable end-to-end for now.
 */
async function runTriage(_body: string): Promise<TriageResult> {
  return { summary: '', priority: 'normal', meetingIntent: null };
}
