import { Module } from '@nestjs/common';
import { CalendarOAuthController } from './calendar-oauth.controller';

@Module({
  controllers: [CalendarOAuthController],
})
export class CalendarModule {}
