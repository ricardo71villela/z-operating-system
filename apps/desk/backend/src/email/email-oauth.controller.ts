import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RequireDeskAuth } from '../auth/desk-auth.decorators';
import type { DeskAuthContext } from '../auth/desk-auth-context';
import { IntegrationCredentialService } from '../integrations-security/integration-credential.service';
import { OAuthStateService } from '../integrations-security/oauth-state.service';
import { exchangeGmailCode, getGmailAuthUrl } from './gmail.client';
import { exchangeMicrosoftCode, getMicrosoftAuthUrl } from './microsoft-graph.client';

type DeskRequest = Request & { deskContext?: DeskAuthContext };

@Controller('integrations/email')
export class EmailOAuthController {
  constructor(
    private readonly states: OAuthStateService,
    private readonly credentials: IntegrationCredentialService,
  ) {}

  @Get('gmail/authorize')
  @RequireDeskAuth()
  async authorizeGmail(@Req() req: DeskRequest, @Res() res: Response) {
    const state = await this.states.issue(req.deskContext!, 'gmail', 'email_connect');
    const redirectUri = `${process.env.DESK_BACKEND_PUBLIC_URL}/integrations/email/gmail/callback`;
    res.redirect(getGmailAuthUrl(redirectUri, state));
  }

  @Get('gmail/callback')
  async gmailCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    const authority = await this.states.consume(state, 'gmail', 'email_connect');
    const redirectUri = `${process.env.DESK_BACKEND_PUBLIC_URL}/integrations/email/gmail/callback`;
    const tokens = await exchangeGmailCode(code, redirectUri);

    await this.credentials.connect(
      authority.workspaceId,
      authority.workspaceMemberId,
      'gmail',
      tokens.email,
      { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt },
    );

    res.redirect(`${process.env.DESK_FRONTEND_PUBLIC_URL}/integrations?connected=gmail`);
  }

  @Get('microsoft/authorize')
  @RequireDeskAuth()
  async authorizeMicrosoft(@Req() req: DeskRequest, @Res() res: Response) {
    const state = await this.states.issue(req.deskContext!, 'microsoft', 'email_connect');
    const redirectUri = `${process.env.DESK_BACKEND_PUBLIC_URL}/integrations/email/microsoft/callback`;
    res.redirect(getMicrosoftAuthUrl(redirectUri, state));
  }

  @Get('microsoft/callback')
  async microsoftCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    const authority = await this.states.consume(state, 'microsoft', 'email_connect');
    const redirectUri = `${process.env.DESK_BACKEND_PUBLIC_URL}/integrations/email/microsoft/callback`;
    const tokens = await exchangeMicrosoftCode(code, redirectUri);

    await this.credentials.connect(
      authority.workspaceId,
      authority.workspaceMemberId,
      'microsoft',
      tokens.email,
      { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt },
    );

    res.redirect(`${process.env.DESK_FRONTEND_PUBLIC_URL}/integrations?connected=microsoft`);
  }
}
