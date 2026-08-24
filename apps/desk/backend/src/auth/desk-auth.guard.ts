import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { DeskAuthContextService } from './desk-auth-context.service';
import { DESK_ALLOWED_ROLES, DESK_AUTH_REQUIRED } from './desk-auth.decorators';
import type { DeskRole } from './desk-auth-context';

@Injectable()
export class DeskAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly contexts: DeskAuthContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(DESK_AUTH_REQUIRED, [
      context.getHandler(),
      context.getClass(),
    ]);
    const allowedRoles = this.reflector.getAllAndOverride<DeskRole[]>(DESK_ALLOWED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required && !allowedRoles?.length) return true;

    const request = context.switchToHttp().getRequest<Request & { deskContext?: unknown }>();
    const organisationHeader = request.header('x-zos-organisation-id') || undefined;
    const deskContext = await this.contexts.requireContext(request.header('authorization'), organisationHeader);
    request.deskContext = deskContext;

    if (allowedRoles?.length && !allowedRoles.includes(deskContext.role)) {
      throw new ForbiddenException('Desk role does not permit this action.');
    }

    // Compatibility bridge for the Claude foundation routes. These values
    // are server-derived and overwrite any caller-supplied authority IDs.
    const query = request.query as Record<string, unknown>;
    query.workspaceId = deskContext.workspaceId;
    delete query.tenantId;

    if (request.body && typeof request.body === 'object') {
      const body = request.body as Record<string, unknown>;
      body.workspaceId = deskContext.workspaceId;
      body.createdBy = deskContext.workspaceMemberId;
      delete body.tenantId;
    }

    return true;
  }
}
