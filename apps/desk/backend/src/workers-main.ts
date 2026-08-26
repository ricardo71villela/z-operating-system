import { scheduleEmailSyncPolling, emailSyncWorker } from './queues/workers/email-sync.worker';
import { scheduleCalendarSyncPolling, calendarSyncWorker } from './queues/workers/calendar-sync.worker';
import { inboundMessageWorker } from './queues/workers/inbound-message.worker';
import { aiTriageWorker } from './queues/workers/ai-triage.worker';
import {
  scheduleWeeklyValidationTick,
  scheduleValidationWorker,
} from './queues/workers/schedule-validation.worker';

async function bootstrapWorkers() {
  await Promise.all([
    scheduleEmailSyncPolling(),
    scheduleCalendarSyncPolling(),
    scheduleWeeklyValidationTick(),
  ]);

  const workers = [
    emailSyncWorker,
    calendarSyncWorker,
    inboundMessageWorker,
    aiTriageWorker,
    scheduleValidationWorker,
  ];

  const shutdown = async (signal: string) => {
    console.log(`Z Desk workers received ${signal}; closing queues.`);
    await Promise.all(workers.map((worker) => worker.close()));
    process.exit(0);
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  console.log('ZDESK_WORKERS=READY');
}

void bootstrapWorkers();
