import { Module } from '@nestjs/common';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { TodayModule } from './today/today.module';

@Module({
  imports: [WhatsappModule, IntegrationsModule, TodayModule],
})
export class AppModule {}
