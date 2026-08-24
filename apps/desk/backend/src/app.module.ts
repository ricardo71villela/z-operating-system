import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { DeskAuthGuard } from './auth/desk-auth.guard';
import { DeskAuthContextService } from './auth/desk-auth-context.service';
import { CalendarModule } from './calendar/calendar.module';
import { EmailModule } from './email/email.module';
import { EventsModule } from './events/events.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { MessagesModule } from './messages/messages.module';
import { PersonnelModule } from './personnel/personnel.module';
import { SettingsModule } from './settings/settings.module';
import { TasksModule } from './tasks/tasks.module';
import { TeamModule } from './team/team.module';
import { TodayModule } from './today/today.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';

/**
 * Z Desk API boundary.
 *
 * Workspace routes and hardened provider boundaries are mounted here. BullMQ
 * workers run from the independent workers-main.ts runtime, preventing API
 * lifecycle from implicitly starting background provider processing.
 */
@Module({
  imports: [
    AuthModule,
    TodayModule,
    EventsModule,
    MessagesModule,
    TasksModule,
    PersonnelModule,
    SettingsModule,
    TeamModule,
    EmailModule,
    CalendarModule,
    IntegrationsModule,
    WhatsappModule,
  ],
  providers: [
    DeskAuthContextService,
    { provide: APP_GUARD, useClass: DeskAuthGuard },
  ],
})
export class AppModule {}
