import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { supabaseAdmin } from '../supabase/supabase-admin';
import { getGmailAuthUrl, exchangeGmailCode } from './gmail.client';
import { getMicrosoftAuthUrl, exchangeMicrosoftCode } from './microsoft-graph.client';

/**
 * OAuth handshake for connecting a Gmail or Microsoft mailbox to a tenant.
 * Mirrors the intent of IntegrationsController's WhatsApp connect endpoint,
 * but email uses real OAuth (WhatsApp Cloud API doesn't) so the flow is a
 * redirect + callback instead of a single POST with a pasted token.
 *
 * AUTH TODO: `state` currently just carries tenantId in the clear. Once
 * desk_users ↔ Supabase auth exists, state must be a signed/opaque value
 * tied to the authenticated session, not a raw tenantId an attacker could
 * substitute to attach their mailbox to someone else's tenant.
 */
@Controller('integrations/email')
export class EmailOAuthController {
  @Get('gmail/authorize')
  authorizeGmail(@Query('tenantId') tenantId: string, @Res() res: Response) {
    const redirectUri = `${process.env.DESK_BACKEND_PUBLIC_URL}/integrations/email/gmail/callback`;
    res.redirect(getGmailAuthUrl(redirectUri, tenantId));
  }

  @Get('gmail/callback')
  async gmailCallback(@Query('code') code: string, @Query('state') tenantId: string, @Res() res: Response) {
    const redirectUri = `${process.env.DESK_BACKEND_PUBLIC_URL}/integrations/email/gmail/callback`;
    const tokens = await exchangeGmailCode(code, redirectUri);

    await supabaseAdmin.from('desk_integrations').upsert(
      {
        tenant_id: tenantId,
        provider: 'gmail',
        external_account_id: tokens.email,
        oauth_tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt },
        status: 'active',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'provider,external_account_id' },
    );

    res.redirect(`${process.env.DESK_FRONTEND_PUBLIC_URL}/integrations?connected=gmail`);
  }

  @Get('microsoft/authorize')
  authorizeMicrosoft(@Query('tenantId') tenantId: string, @Res() res: Response) {
    const redirectUri = `${process.env.DESK_BACKEND_PUBLIC_URL}/integrations/email/microsoft/callback`;
    res.redirect(getMicrosoftAuthUrl(redirectUri, tenantId));
  }

  @Get('microsoft/callback')
  async microsoftCallback(@Query('code') code: string, @Query('state') tenantId: string, @Res() res: Response) {
    const redirectUri = `${process.env.DESK_BACKEND_PUBLIC_URL}/integrations/email/microsoft/callback`;
    const tokens = await exchangeMicrosoftCode(code, redirectUri);

    await supabaseAdmin.from('desk_integrations').upsert(
      {
        tenant_id: tenantId,
        provider: 'microsoft',
        external_account_id: tokens.email,
        oauth_tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt },
        status: 'active',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'provider,external_account_id' },
    );

    res.redirect(`${process.env.DESK_FRONTEND_PUBLIC_URL}/integrations?connected=microsoft`);
  }
}
