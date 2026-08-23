import { Module } from '@nestjs/common';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { TodayModule } from './today/today.module';
import { EmailModule } from './email/email.module';
import { CalendarModule } from './calendar/calendar.module';
import { EventsModule } from './events/events.module';
import { AuthModule } from './auth/auth.module';
import { MessagesModule } from './messages/messages.module';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [
    WhatsappModule,
    IntegrationsModule,
    TodayModule,
    EmailModule,
    CalendarModule,
    EventsModule,
    AuthModule,
    MessagesModule,
    TasksModule,
  ],
})
export class AppModule {}
