import { Worker, Queue } from 'bullmq';
import { redisConnection } from '../queues';
import { deskAdmin } from '../../supabase/supabase-admin';

export const SCHEDULE_VALIDATION_QUEUE = 'desk-schedule-validation';
export const scheduleValidationQueue = new Queue(SCHEDULE_VALIDATION_QUEUE, { connection: redisConnection });

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function scheduleWeeklyValidationTick() {
  return scheduleValidationQueue.add(
    'create-pending-validations',
    {},
    { repeat: { every: CHECK_INTERVAL_MS }, jobId: 'schedule-validation-daily-tick' },
  );
}

function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Creates pending validation rows for active Desk workspace members. It does
 * not validate schedules: confirmation remains an explicit human action.
 */
export const scheduleValidationWorker = new Worker(
  SCHEDULE_VALIDATION_QUEUE,
  async () => {
    const targetWeekStart = toDateString(mondayOf(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)));

    const { data: members, error: membersError } = await deskAdmin
      .from('workspace_members')
      .select('id,workspace_id')
      .eq('status', 'active');
    if (membersError) throw membersError;

    for (const member of members ?? []) {
      const { error } = await deskAdmin
        .from('schedule_validations')
        .upsert(
          {
            workspace_id: member.workspace_id,
            member_id: member.id,
            week_start_date: targetWeekStart,
            status: 'pending',
          },
          { onConflict: 'workspace_id,member_id,week_start_date', ignoreDuplicates: true },
        );
      if (error) throw error;
    }
  },
  { connection: redisConnection },
);
