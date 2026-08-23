import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { DeskAuthGuard } from './auth/desk-auth.guard';
import { DeskAuthContextService } from './auth/desk-auth-context.service';
import { CalendarModule } from './calendar/calendar.module';
import { EmailModule } from './email/email.module';
import { EventsModule } from './events/events.module';
import { MessagesModule } from './messages/messages.module';
import { PersonnelModule } from './personnel/personnel.module';
import { TasksModule } from './tasks/tasks.module';
import { TodayModule } from './today/today.module';

/**
 * D3A activation boundary.
 *
 * Core workspace routes plus hardened Google/Microsoft email/calendar OAuth
 * are mounted behind canonical ZOS authority. WhatsApp connect/webhook and
 * background provider sync remain unmounted/disabled until D3B proves signed
 * webhook verification, encrypted credential reads/refresh and idempotency.
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
  ],
  providers: [
    DeskAuthContextService,
    { provide: APP_GUARD, useClass: DeskAuthGuard },
  ],
})
export class AppModule {}
