import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { deskAdmin, supabaseAdmin } from '../supabase/supabase-admin';
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

type IdentityRow = { person_id: string; membership_id: string | null; organisation_id: string | null };

@Injectable()
export class DeskAuthContextService {
  async requireContext(authHeader?: string, requestedOrganisationId?: string): Promise<DeskAuthContext> {
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) throw new UnauthorizedException('Missing bearer session.');

    const { data: authResult, error: authError } = await supabaseAdmin.auth.getUser(token);
    const authUser = authResult?.user;
    if (authError || !authUser) throw new UnauthorizedException('Invalid session.');

    // Schema zos is closed to the Data API: identity comes from a
    // service-role-only SECURITY DEFINER function.
    const { data: identityRows, error: identityError } = await supabaseAdmin.rpc('zdesk_identity_for_auth_user', {
      p_auth_user_id: authUser.id,
      p_organisation_id: requestedOrganisationId ?? null,
    });
    if (identityError) throw identityError;
    const identity = (identityRows ?? []) as IdentityRow[];
    if (identity.length === 0) throw new ForbiddenException('No canonical ZOS Person is linked to this account.');
    const person = { id: identity[0].person_id };

    const activeMemberships: MembershipRow[] = identity
      .filter((row) => row.membership_id !== null && row.organisation_id !== null)
      .map((row) => ({ id: row.membership_id as string, organisation_id: row.organisation_id as string }));
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
