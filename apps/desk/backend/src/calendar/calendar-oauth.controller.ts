import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RequireDeskAuth } from '../auth/desk-auth.decorators';
import type { DeskAuthContext } from '../auth/desk-auth-context';
import { exchangeGmailCode, getGmailAuthUrl } from '../email/gmail.client';
import { exchangeMicrosoftCode, getMicrosoftAuthUrl } from '../email/microsoft-graph.client';
import { IntegrationCredentialService } from '../integrations-security/integration-credential.service';
import { OAuthStateService } from '../integrations-security/oauth-state.service';

type DeskRequest = Request & { deskContext?: DeskAuthContext };

const GOOGLE_CALENDAR_SCOPE =
  'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events email';
const MICROSOFT_CALENDAR_SCOPE = 'offline_access Calendars.Read Calendars.ReadWrite User.Read';

@Controller('integrations/calendar')
export class CalendarOAuthController {
  constructor(
    private readonly states: OAuthStateService,
    private readonly credentials: IntegrationCredentialService,
  ) {}

  @Get('google/authorize')
  @RequireDeskAuth()
  async authorizeGoogle(@Req() req: DeskRequest, @Res() res: Response) {
    const state = await this.states.issue(req.deskContext!, 'google_calendar', 'calendar_connect');
    const redirectUri = `${process.env.DESK_BACKEND_PUBLIC_URL}/integrations/calendar/google/callback`;
    res.redirect(getGmailAuthUrl(redirectUri, state, GOOGLE_CALENDAR_SCOPE));
  }

  @Get('google/callback')
  async googleCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    const authority = await this.states.consume(state, 'google_calendar', 'calendar_connect');
    const redirectUri = `${process.env.DESK_BACKEND_PUBLIC_URL}/integrations/calendar/google/callback`;
    const tokens = await exchangeGmailCode(code, redirectUri);

    await this.credentials.connect(
      authority.workspaceId,
      authority.workspaceMemberId,
      'google_calendar',
      tokens.email,
      { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt },
    );

    res.redirect(`${process.env.DESK_FRONTEND_PUBLIC_URL}/integrations?connected=google_calendar`);
  }

  @Get('microsoft/authorize')
  @RequireDeskAuth()
  async authorizeMicrosoft(@Req() req: DeskRequest, @Res() res: Response) {
    const state = await this.states.issue(req.deskContext!, 'microsoft_calendar', 'calendar_connect');
    const redirectUri = `${process.env.DESK_BACKEND_PUBLIC_URL}/integrations/calendar/microsoft/callback`;
    res.redirect(getMicrosoftAuthUrl(redirectUri, state, MICROSOFT_CALENDAR_SCOPE));
  }

  @Get('microsoft/callback')
  async microsoftCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    const authority = await this.states.consume(state, 'microsoft_calendar', 'calendar_connect');
    const redirectUri = `${process.env.DESK_BACKEND_PUBLIC_URL}/integrations/calendar/microsoft/callback`;
    const tokens = await exchangeMicrosoftCode(code, redirectUri);

    await this.credentials.connect(
      authority.workspaceId,
      authority.workspaceMemberId,
      'microsoft_calendar',
      tokens.email,
      { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt },
    );

    res.redirect(`${process.env.DESK_FRONTEND_PUBLIC_URL}/integrations?connected=microsoft_calendar`);
  }
}
