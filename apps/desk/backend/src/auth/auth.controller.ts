import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { supabaseAdmin } from '../supabase/supabase-admin';

/**
 * Bootstraps a brand-new tenant for a freshly signed-up Supabase auth user.
 * This is the one piece the RLS migration (20260823004000) depends on:
 * without a desk_users row, desk_current_user_tenant_id() returns null and
 * every policy denies by default — correct as a fail-safe, but useless
 * until someone actually gets a tenant.
 *
 * Idempotent: calling this again for a user who already has a desk_users
 * row just returns their existing tenant instead of creating a second one.
 *
 * Deliberately minimal for v1: one person → creates → becomes 'owner' of
 * a brand-new tenant. Inviting teammates into an *existing* tenant (join,
 * not create) is a separate, still-open flow — not built here.
 */
@Controller('auth')
export class AuthController {
  @Post('bootstrap-tenant')
  async bootstrapTenant(@Headers('authorization') authHeader: string, @Body('tenantName') tenantName: string) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('Token de sessão em falta.');

    const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authUser?.user) throw new UnauthorizedException('Sessão inválida.');

    const { data: existing } = await supabaseAdmin
      .from('desk_users')
      .select('tenant_id')
      .eq('auth_user_id', authUser.user.id)
      .maybeSingle();

    if (existing) return { tenantId: existing.tenant_id, created: false };

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('desk_tenants')
      .insert({ name: tenantName || 'Nova organização' })
      .select()
      .single();
    if (tenantError) throw tenantError;

    const { error: userError } = await supabaseAdmin.from('desk_users').insert({
      tenant_id: tenant.id,
      auth_user_id: authUser.user.id,
      email: authUser.user.email,
      role: 'owner',
    });
    if (userError) throw userError;

    return { tenantId: tenant.id, created: true };
  }
}
