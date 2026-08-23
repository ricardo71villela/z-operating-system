import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
// Starting these registers the BullMQ workers (inbound message → AI triage,
// email sync, calendar sync).
// TODO: split into a dedicated worker process once volume justifies it —
// running workers in the same process as the HTTP server is a v1 shortcut.
import './queues/workers/inbound-message.worker';
import './queues/workers/ai-triage.worker';
import { emailSyncWorker, scheduleEmailSyncPolling } from './queues/workers/email-sync.worker';
import { calendarSyncWorker, scheduleCalendarSyncPolling } from './queues/workers/calendar-sync.worker';
import { scheduleValidationWorker, scheduleWeeklyValidationTick } from './queues/workers/schedule-validation.worker';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  scheduleEmailSyncPolling();
  scheduleCalendarSyncPolling();
  scheduleWeeklyValidationTick();
  await app.listen(process.env.PORT ?? 3001);
}

bootstrap();
