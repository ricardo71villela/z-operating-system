export type DeskRole = 'owner' | 'admin' | 'member';

export interface DeskAuthContext {
  authUserId: string;
  personId: string;
  organisationId: string;
  membershipId: string;
  workspaceId: string;
  workspaceMemberId: string;
  role: DeskRole;
}
