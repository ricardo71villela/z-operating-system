import { Worker, Queue } from 'bullmq';
import { redisConnection } from '../queues';
import { supabaseAdmin } from '../../supabase/supabase-admin';

export const SCHEDULE_VALIDATION_QUEUE = 'desk:schedule-validation';
export const scheduleValidationQueue = new Queue(SCHEDULE_VALIDATION_QUEUE, { connection: redisConnection });

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day is enough — this only needs to catch the T-15 boundary

export function scheduleWeeklyValidationTick() {
  scheduleValidationQueue.add(
    'create-pending-validations',
    {},
    { repeat: { every: CHECK_INTERVAL_MS }, jobId: 'schedule-validation-daily-tick' },
  );
}

function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=domingo
  const diff = day === 0 ? -6 : 1 - day; // volta à segunda-feira dessa semana
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Per ADR-0005: every day, checks whether the week starting in exactly 15
 * days needs a pending validation row created for each tenant user who
 * doesn't already have one for that week. Creating the row is automatic;
 * validating it (confirming or adjusting via desk_schedule_overrides) is
 * always a human action through the API, never done by this worker.
 */
export const scheduleValidationWorker = new Worker(
  SCHEDULE_VALIDATION_QUEUE,
  async () => {
    const targetWeekStart = toDateString(mondayOf(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)));

    const { data: users, error: usersError } = await supabaseAdmin.from('desk_users').select('id, tenant_id');
    if (usersError) throw usersError;

    for (const user of users ?? []) {
      const { error } = await supabaseAdmin
        .from('desk_schedule_validations')
        .upsert(
          {
            tenant_id: user.tenant_id,
            user_id: user.id,
            week_start_date: targetWeekStart,
            status: 'pending',
          },
          { onConflict: 'tenant_id,user_id,week_start_date', ignoreDuplicates: true },
        );
      if (error) throw error;
    }
  },
  { connection: redisConnection },
);
