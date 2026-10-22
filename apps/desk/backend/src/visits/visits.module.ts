import { Module } from '@nestjs/common';
import { VisitsController } from './visits.controller';

@Module({ controllers: [VisitsController] })
export class VisitsModule {}
