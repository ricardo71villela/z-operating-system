import { Module } from '@nestjs/common';
import { IntegrationCredentialService } from './integration-credential.service';
import { OAuthStateService } from './oauth-state.service';

@Module({
  providers: [OAuthStateService, IntegrationCredentialService],
  exports: [OAuthStateService, IntegrationCredentialService],
})
export class IntegrationsSecurityModule {}
