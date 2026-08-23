import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
// Starting these registers the BullMQ workers (inbound message → AI triage).
// TODO: split into a dedicated worker process once volume justifies it —
// running workers in the same process as the HTTP server is a v1 shortcut.
import './queues/workers/inbound-message.worker';
import './queues/workers/ai-triage.worker';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3001);
}

bootstrap();
