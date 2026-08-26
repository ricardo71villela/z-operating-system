import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { DeskAuthContextService } from './desk-auth-context.service';

@Module({
  controllers: [AuthController],
  providers: [DeskAuthContextService],
  exports: [DeskAuthContextService],
})
export class AuthModule {}
