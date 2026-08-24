import { Body, Controller, ForbiddenException, Get, Headers, Param, Patch, Post, Req, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { RequireDeskAuth, RequireDeskRoles } from '../auth/desk-auth.decorators';
import type { DeskAuthContext, DeskRole } from '../auth/desk-auth-context';
import { deskAdmin, supabaseAdmin, zosAdmin } from '../supabase/supabase-admin';

type DeskRequest = Request & { deskContext?: DeskAuthContext };
type InviteRole = Exclude<DeskRole, 'owner'>;

interface WorkspaceMemberRow {
  id: string;
  membership_id: string;
  role: DeskRole;
  status: string;
  preferred_language: string;
  created_at: string;
}

interface MembershipRow {
  id: string;
  person_id: string;
}

interface PersonRow {
  id: string;
  display_name: string | null;
}

function invitationTokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function normalizeInviteRole(value: unknown): InviteRole {
  const role = String(value ?? 'member').trim();
  if (role !== 'admin' && role !== 'member') throw new ForbiddenException('Desk invitation role must be admin or member.');
  return role;
}

@Controller('team')
export class TeamController {
  @Get('members')
  @RequireDeskAuth()
  async listMembers(@Req() req: DeskRequest) {
    const context = req.deskContext!;
    const { data: deskMembers, error: deskError } = await deskAdmin
      .from('workspace_members')
      .select('id,membership_id,role,status,preferred_language,created_at')
      .eq('workspace_id', context.workspaceId)
      .order('created_at', { ascending: true });
    if (deskError) throw deskError;

    const members = (deskMembers ?? []) as WorkspaceMemberRow[];
    const membershipIds = members.map((member) => member.membership_id);
    if (membershipIds.length === 0) return [];

    const { data: memberships, error: membershipsError } = await zosAdmin
      .from('memberships')
      .select('id,person_id')
      .in('id', membershipIds);
    if (membershipsError) throw membershipsError;
    const membershipRows = (memberships ?? []) as MembershipRow[];
    const personIds = membershipRows.map((membership) => membership.person_id);

    const { data: persons, error: personsError } = await zosAdmin
      .from('persons')
      .select('id,display_name')
      .in('id', personIds);
    if (personsError) throw personsError;

    const membershipById = new Map(membershipRows.map((membership) => [membership.id, membership]));
    const personById = new Map(((persons ?? []) as PersonRow[]).map((person) => [person.id, person]));

    return members.map((member) => {
      const membership = membershipById.get(member.membership_id);
      const person = membership ? personById.get(membership.person_id) : undefined;
      return {
        workspaceMemberId: member.id,
        displayName: person?.display_name ?? null,
        role: member.role,
        status: member.status,
        preferredLanguage: member.preferred_language,
        createdAt: member.created_at,
      };
    });
  }

  @Post('invitations')
  @RequireDeskAuth()
  @RequireDeskRoles('owner', 'admin')
  async createInvitation(
    @Req() req: DeskRequest,
    @Body() body: { email?: string; role?: InviteRole },
  ) {
    const context = req.deskContext!;
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!email || !email.includes('@') || email.length > 320) throw new ForbiddenException('A valid invitation email is required.');

    const role = normalizeInviteRole(body.role);
    if (context.role === 'admin' && role !== 'member') {
      throw new ForbiddenException('Desk admins may invite members only.');
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = invitationTokenHash(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin.rpc('zdesk_create_invitation', {
      p_workspace_id: context.workspaceId,
      p_invited_by_member_id: context.workspaceMemberId,
      p_email: email,
      p_role: role,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt,
    });
    if (error) throw error;

    return {
      ...(data as Record<string, unknown>),
      token,
      delivery: 'caller_must_deliver_securely',
    };
  }

  @Post('invitations/accept')
  async acceptInvitation(
    @Headers('authorization') authHeader: string,
    @Body() body: { token?: string },
  ) {
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!bearer) throw new UnauthorizedException('Missing bearer session.');

    const { data: authResult, error: authError } = await supabaseAdmin.auth.getUser(bearer);
    const user = authResult?.user;
    if (authError || !user) throw new UnauthorizedException('Invalid session.');
    if (!user.email || !user.email_confirmed_at) throw new ForbiddenException('A verified email is required to accept a Desk invitation.');

    const token = String(body.token ?? '').trim();
    if (token.length < 32 || token.length > 256) throw new ForbiddenException('Invalid Desk invitation token.');

    const { data, error } = await supabaseAdmin.rpc('zdesk_accept_invitation', {
      p_auth_user_id: user.id,
      p_token_hash: invitationTokenHash(token),
    });
    if (error) throw error;
    return data;
  }

  @Patch('members/:memberId/role')
  @RequireDeskAuth()
  @RequireDeskRoles('owner')
  async setMemberRole(
    @Req() req: DeskRequest,
    @Param('memberId') memberId: string,
    @Body() body: { role?: InviteRole },
  ) {
    const context = req.deskContext!;
    const role = normalizeInviteRole(body.role);
    const { data, error } = await supabaseAdmin.rpc('zdesk_set_member_role', {
      p_workspace_id: context.workspaceId,
      p_actor_member_id: context.workspaceMemberId,
      p_target_member_id: memberId,
      p_role: role,
    });
    if (error) throw error;
    return data;
  }
}
