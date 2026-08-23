import { Module } from '@nestjs/common';
import { EmailOAuthController } from './email-oauth.controller';

@Module({
  controllers: [EmailOAuthController],
})
export class EmailModule {}
