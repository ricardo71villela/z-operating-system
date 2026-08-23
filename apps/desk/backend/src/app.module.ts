import { Module } from '@nestjs/common';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { TodayModule } from './today/today.module';
import { EmailModule } from './email/email.module';
import { CalendarModule } from './calendar/calendar.module';
import { EventsModule } from './events/events.module';

@Module({
  imports: [WhatsappModule, IntegrationsModule, TodayModule, EmailModule, CalendarModule, EventsModule],
})
export class AppModule {}
