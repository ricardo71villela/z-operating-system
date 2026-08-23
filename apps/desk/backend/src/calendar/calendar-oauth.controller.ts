import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { supabaseAdmin } from '../supabase/supabase-admin';
import { getGmailAuthUrl } from '../email/gmail.client';
import { getMicrosoftAuthUrl } from '../email/microsoft-graph.client';

/**
 * OAuth handshake for connecting Google/Outlook Calendar to a tenant.
 * Reuses the mail OAuth URL builders with a calendar scope override — the
 * authorize/token endpoints are the same per provider, only the requested
 * scope differs (Google/Microsoft both allow incremental scope requests
 * on the same client). See email-oauth.controller.ts for the AUTH TODO on
 * `state`, which applies here identically.
 */
@Controller('integrations/calendar')
export class CalendarOAuthController {
  @Get('google/authorize')
  authorizeGoogle(@Query('tenantId') tenantId: string, @Res() res: Response) {
    const redirectUri = `${process.env.DESK_BACKEND_PUBLIC_URL}/integrations/calendar/google/callback`;
    const url = getGmailAuthUrl(redirectUri, tenantId).replace(
      'gmail.readonly',
      'calendar.readonly calendar.events',
    );
    res.redirect(url);
  }

  @Get('google/callback')
  async googleCallback(@Query('code') code: string, @Query('state') tenantId: string, @Res() res: Response) {
    // TODO: exchange code (mirrors exchangeGmailCode, but hitting the
    // userinfo call is unnecessary here — the calendar account email isn't
    // needed as external_account_id; the primary calendar is identified
    // implicitly by the token itself). Left unimplemented pending a
    // shared token-exchange helper instead of duplicating gmail.client's.
    res.redirect(`${process.env.DESK_FRONTEND_PUBLIC_URL}/integrations?connected=google_calendar&status=pending`);
  }

  @Get('microsoft/authorize')
  authorizeMicrosoft(@Query('tenantId') tenantId: string, @Res() res: Response) {
    const redirectUri = `${process.env.DESK_BACKEND_PUBLIC_URL}/integrations/calendar/microsoft/callback`;
    const url = getMicrosoftAuthUrl(redirectUri, tenantId).replace('Mail.Read', 'Calendars.Read Calendars.ReadWrite');
    res.redirect(url);
  }

  @Get('microsoft/callback')
  async microsoftCallback(@Query('code') code: string, @Query('state') tenantId: string, @Res() res: Response) {
    // TODO: same as googleCallback above.
    res.redirect(`${process.env.DESK_FRONTEND_PUBLIC_URL}/integrations?connected=microsoft_calendar&status=pending`);
  }
}
