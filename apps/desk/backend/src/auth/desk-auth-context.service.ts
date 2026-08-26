import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { deskAdmin, supabaseAdmin, zosAdmin } from '../supabase/supabase-admin';
import type { DeskAuthContext, DeskRole } from './desk-auth-context';

interface MembershipRow {
  id: string;
  organisation_id: string;
}

interface WorkspaceRow {
  id: string;
  organisation_id: string;
}

interface WorkspaceMemberRow {
  id: string;
  workspace_id: string;
  membership_id: string;
  role: DeskRole;
}

@Injectable()
export class DeskAuthContextService {
  async requireContext(authHeader?: string, requestedOrganisationId?: string): Promise<DeskAuthContext> {
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) throw new UnauthorizedException('Missing bearer session.');

    const { data: authResult, error: authError } = await supabaseAdmin.auth.getUser(token);
    const authUser = authResult?.user;
    if (authError || !authUser) throw new UnauthorizedException('Invalid session.');

    const { data: person, error: personError } = await zosAdmin
      .from('persons')
      .select('id')
      .eq('auth_user_id', authUser.id)
      .maybeSingle();
    if (personError) throw personError;
    if (!person) throw new ForbiddenException('No canonical ZOS Person is linked to this account.');

    let membershipQuery = zosAdmin
      .from('memberships')
      .select('id, organisation_id')
      .eq('person_id', person.id)
      .eq('status', 'active');
    if (requestedOrganisationId) membershipQuery = membershipQuery.eq('organisation_id', requestedOrganisationId);

    const { data: memberships, error: membershipsError } = await membershipQuery;
    if (membershipsError) throw membershipsError;
    const activeMemberships = (memberships ?? []) as MembershipRow[];
    if (activeMemberships.length === 0) throw new ForbiddenException('No active ZOS organisation membership.');

    const organisationIds = [...new Set(activeMemberships.map((membership) => membership.organisation_id))];
    const membershipIds = activeMemberships.map((membership) => membership.id);

    const { data: workspaces, error: workspacesError } = await deskAdmin
      .from('workspaces')
      .select('id, organisation_id')
      .eq('status', 'active')
      .in('organisation_id', organisationIds);
    if (workspacesError) throw workspacesError;
    const activeWorkspaces = (workspaces ?? []) as WorkspaceRow[];
    if (activeWorkspaces.length === 0) throw new ForbiddenException('Z Desk is not enabled for an active organisation.');

    const workspaceIds = activeWorkspaces.map((workspace) => workspace.id);
    const { data: deskMembers, error: deskMembersError } = await deskAdmin
      .from('workspace_members')
      .select('id, workspace_id, membership_id, role')
      .eq('status', 'active')
      .in('workspace_id', workspaceIds)
      .in('membership_id', membershipIds);
    if (deskMembersError) throw deskMembersError;

    const workspaceById = new Map(activeWorkspaces.map((workspace) => [workspace.id, workspace]));
    const membershipById = new Map(activeMemberships.map((membership) => [membership.id, membership]));

    const candidates = ((deskMembers ?? []) as WorkspaceMemberRow[])
      .map((deskMember) => {
        const workspace = workspaceById.get(deskMember.workspace_id);
        const membership = membershipById.get(deskMember.membership_id);
        if (!workspace || !membership || workspace.organisation_id !== membership.organisation_id) return null;
        return {
          authUserId: authUser.id,
          personId: person.id,
          organisationId: workspace.organisation_id,
          membershipId: membership.id,
          workspaceId: workspace.id,
          workspaceMemberId: deskMember.id,
          role: deskMember.role,
        } satisfies DeskAuthContext;
      })
      .filter((candidate): candidate is DeskAuthContext => candidate !== null);

    if (candidates.length === 0) throw new ForbiddenException('No active Z Desk workspace membership.');
    if (candidates.length > 1 && !requestedOrganisationId) {
      throw new BadRequestException('Multiple Z Desk organisations are available. Send X-ZOS-Organisation-Id.');
    }
    if (candidates.length > 1) throw new ForbiddenException('Ambiguous Z Desk workspace authority.');

    return candidates[0];
  }
}
