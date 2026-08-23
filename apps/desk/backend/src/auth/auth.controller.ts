import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { supabaseAdmin } from '../supabase/supabase-admin';

@Controller('auth')
export class AuthController {
  @Post('bootstrap-workspace')
  async bootstrapWorkspace(
    @Headers('authorization') authHeader: string,
    @Body() body: { workspaceName?: string; organisationId?: string },
  ) {
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) throw new UnauthorizedException('Missing bearer session.');

    const { data: authResult, error: authError } = await supabaseAdmin.auth.getUser(token);
    const user = authResult?.user;
    if (authError || !user) throw new UnauthorizedException('Invalid session.');

    const { data, error } = await supabaseAdmin.rpc('zdesk_bootstrap_workspace', {
      p_auth_user_id: user.id,
      p_email: user.email ?? '',
      p_name: body.workspaceName ?? 'Z Desk organisation',
      p_organisation_id: body.organisationId ?? null,
    });
    if (error) throw error;
    return data;
  }
}
