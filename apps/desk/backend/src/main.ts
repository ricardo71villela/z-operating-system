import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

function assertLegacyWorkersRemainDisabled() {
  if (process.env.DESK_ENABLE_WORKERS === 'true') {
    throw new Error(
      'Z Desk background workers remain disabled until they are migrated to canonical workspace authority. Do not enable DESK_ENABLE_WORKERS.',
    );
  }
}

async function bootstrap() {
  assertLegacyWorkersRemainDisabled();
  const app = await NestFactory.create(AppModule, { rawBody: true });
  await app.listen(process.env.PORT ?? 3001);
}

void bootstrap();
