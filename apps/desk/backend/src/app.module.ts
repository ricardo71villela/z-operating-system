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
import { TasksModule } from './tasks/tasks.module';
import { TodayModule } from './today/today.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';

/**
 * D3B activation boundary.
 *
 * Core workspace routes, hardened Google/Microsoft OAuth, workspace-scoped
 * WhatsApp onboarding and signed WhatsApp webhook verification are mounted.
 * Background provider workers remain fail-closed until their legacy tenant
 * semantics are migrated to canonical Desk workspace authority.
 */
@Module({
  imports: [
    AuthModule,
    TodayModule,
    EventsModule,
    MessagesModule,
    TasksModule,
    PersonnelModule,
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
