import { SetMetadata } from '@nestjs/common';

export const DESK_AUTH_REQUIRED = 'desk.auth.required';
export const RequireDeskAuth = () => SetMetadata(DESK_AUTH_REQUIRED, true);
