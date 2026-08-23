import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function startWorkersIfEnabled() {
  if (process.env.DESK_ENABLE_WORKERS !== 'true') return;

  await import('./queues/workers/inbound-message.worker');
  await import('./queues/workers/ai-triage.worker');
  const { scheduleEmailSyncPolling } = await import('./queues/workers/email-sync.worker');
  const { scheduleCalendarSyncPolling } = await import('./queues/workers/calendar-sync.worker');
  const { scheduleWeeklyValidationTick } = await import('./queues/workers/schedule-validation.worker');

  scheduleEmailSyncPolling();
  scheduleCalendarSyncPolling();
  scheduleWeeklyValidationTick();
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await startWorkersIfEnabled();
  await app.listen(process.env.PORT ?? 3001);
}

void bootstrap();
