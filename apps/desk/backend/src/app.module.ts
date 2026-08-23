import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { DeskAuthGuard } from './auth/desk-auth.guard';
import { DeskAuthContextService } from './auth/desk-auth-context.service';
import { EventsModule } from './events/events.module';
import { MessagesModule } from './messages/messages.module';
import { PersonnelModule } from './personnel/personnel.module';
import { TasksModule } from './tasks/tasks.module';
import { TodayModule } from './today/today.module';

/**
 * D1 activation boundary.
 *
 * Core workspace routes are mounted behind canonical ZOS authorization.
 * Provider connect/OAuth/webhook modules remain source-present but unmounted
 * until D3 credential storage, one-time OAuth state and webhook verification
 * are complete. External calendar push / schedule WhatsApp export also remain
 * disabled unless explicitly enabled by server-only environment flags.
 */
@Module({
  imports: [AuthModule, TodayModule, EventsModule, MessagesModule, TasksModule, PersonnelModule],
  providers: [
    DeskAuthContextService,
    { provide: APP_GUARD, useClass: DeskAuthGuard },
  ],
})
export class AppModule {}
