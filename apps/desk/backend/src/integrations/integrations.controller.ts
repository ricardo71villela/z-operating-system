import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { supabaseAdmin } from '../supabase/supabase-admin';

/**
 * Onboarding for channel integrations. This is what the tenant-resolution
 * service (see ../tenant-resolution) reads at message-ingestion time —
 * without a row created here, an inbound WhatsApp message has nowhere to
 * resolve to and is dropped (see inbound-message.worker.ts).
 *
 * AUTH TODO: tenantId is accepted directly in the request for now because
 * desk_users ↔ Supabase auth session wiring doesn't exist yet. Once it
 * does, tenantId must come from the authenticated session, never from the
 * request body/query — a tenant must not be able to attach an integration
 * to another tenant's id.
 *
 * WhatsApp onboarding here assumes the admin already created a Meta app +
 * WhatsApp Business Account and generated a system-user access token
 * through Meta's own setup (Business Manager). Meta's "Embedded Signup"
 * flow (in-product, no manual token copy) is a real improvement but a
 * separate, larger piece of work — not attempted in this foundation.
 */
@Controller('integrations')
export class IntegrationsController {
  @Post('whatsapp/connect')
  async connectWhatsapp(
    @Body()
    body: {
      tenantId: string;
      phoneNumberId: string;
      accessToken: string;
      displayPhoneNumber?: string;
    },
  ) {
    const { tenantId, phoneNumberId, accessToken, displayPhoneNumber } = body;

    const { data, error } = await supabaseAdmin
      .from('desk_integrations')
      .upsert(
        {
          tenant_id: tenantId,
          provider: 'whatsapp',
          external_account_id: phoneNumberId,
          oauth_tokens: { accessToken, displayPhoneNumber },
          status: 'active',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'provider,external_account_id' },
      )
      .select('id, provider, external_account_id, status, created_at')
      .single();

    if (error) throw error;
    return data;
  }

  @Get()
  async list(@Query('tenantId') tenantId: string) {
    const { data, error } = await supabaseAdmin
      .from('desk_integrations')
      .select('id, provider, external_account_id, status, created_at')
      .eq('tenant_id', tenantId);

    if (error) throw error;
    return data;
  }

  @Delete(':id')
  async disconnect(@Param('id') id: string, @Query('tenantId') tenantId: string) {
    const { error } = await supabaseAdmin
      .from('desk_integrations')
      .update({ status: 'disconnected', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) throw error;
    return { disconnected: true };
  }
}
