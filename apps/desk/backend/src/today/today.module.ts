import { Module } from '@nestjs/common';
import { TodayController } from './today.controller';

@Module({
  controllers: [TodayController],
})
export class TodayModule {}
