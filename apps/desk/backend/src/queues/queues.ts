import { Queue } from 'bullmq';
import IORedis from 'ioredis';

/**
 * Shared Redis connection for all Z Desk queues.
 * BullMQ requires maxRetriesPerRequest: null on the connection it manages.
 */
export const redisConnection = new IORedis(
  process.env.REDIS_URL ?? 'redis://localhost:6379',
  { maxRetriesPerRequest: null },
);

export const INBOUND_MESSAGE_QUEUE = 'desk:inbound-message';
export const AI_TRIAGE_QUEUE = 'desk:ai-triage';
export const CALENDAR_SYNC_QUEUE = 'desk:calendar-sync';
export const EMAIL_SYNC_QUEUE = 'desk:email-sync';

export const inboundMessageQueue = new Queue(INBOUND_MESSAGE_QUEUE, {
  connection: redisConnection,
});

export const aiTriageQueue = new Queue(AI_TRIAGE_QUEUE, {
  connection: redisConnection,
});

export const calendarSyncQueue = new Queue(CALENDAR_SYNC_QUEUE, {
  connection: redisConnection,
});

export const emailSyncQueue = new Queue(EMAIL_SYNC_QUEUE, {
  connection: redisConnection,
});
