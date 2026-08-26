import { SetMetadata } from '@nestjs/common';
import type { DeskRole } from './desk-auth-context';

export const DESK_AUTH_REQUIRED = 'desk.auth.required';
export const DESK_ALLOWED_ROLES = 'desk.auth.allowed_roles';

export const RequireDeskAuth = () => SetMetadata(DESK_AUTH_REQUIRED, true);
export const RequireDeskRoles = (...roles: DeskRole[]) => SetMetadata(DESK_ALLOWED_ROLES, roles);
