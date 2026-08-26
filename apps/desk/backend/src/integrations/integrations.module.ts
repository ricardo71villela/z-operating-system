import { Module } from '@nestjs/common';
import { IntegrationsSecurityModule } from '../integrations-security/integrations-security.module';
import { IntegrationsController } from './integrations.controller';

@Module({
  imports: [IntegrationsSecurityModule],
  controllers: [IntegrationsController],
})
export class IntegrationsModule {}
