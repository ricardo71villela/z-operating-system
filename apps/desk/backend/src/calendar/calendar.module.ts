import { Module } from '@nestjs/common';
import { IntegrationsSecurityModule } from '../integrations-security/integrations-security.module';
import { CalendarOAuthController } from './calendar-oauth.controller';

@Module({
  imports: [IntegrationsSecurityModule],
  controllers: [CalendarOAuthController],
})
export class CalendarModule {}
