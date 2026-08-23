import { Module } from '@nestjs/common';
import { IntegrationsSecurityModule } from '../integrations-security/integrations-security.module';
import { EmailOAuthController } from './email-oauth.controller';

@Module({
  imports: [IntegrationsSecurityModule],
  controllers: [EmailOAuthController],
})
export class EmailModule {}
