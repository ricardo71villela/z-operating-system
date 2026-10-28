import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequireDeskAuth } from '../auth/desk-auth.decorators';
import type { DeskAuthContext } from '../auth/desk-auth-context';
import { supabaseAdmin } from '../supabase/supabase-admin';

type DeskRequest = Request & { deskContext?: DeskAuthContext };

const STATUSES = new Set(['new', 'contacted', 'closed']);
const SOURCES = new Set(['z_find']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Marketplace requests (Z Desk Lite): every contact and visit request
 * received on the agency's Z Find listings, in one inbox. Workspace and
 * member always come from the verified session, never from the request.
 */
@RequireDeskAuth()
@Controller('requests')
export class RequestsController {
  @Get()
  async list(@Req() req: DeskRequest, @Query('status') status?: string) {
    const context = req.deskContext!;
    if (status && !STATUSES.has(status)) throw new BadRequestException('Unknown status.');
    const { data, error } = await supabaseAdmin.rpc('zdesk_marketplace_requests', {
      p_workspace_id: context.workspaceId,
      p_status: status ?? null,
    });
    if (error) throw error;
    return data ?? [];
  }

  @Get('summary')
  async summary(@Req() req: DeskRequest) {
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_marketplace_requests_summary', {
      p_workspace_id: context.workspaceId,
    });
    if (error) throw error;
    return data ?? { new: 0, latestAt: null };
  }

  @Patch(':source/:id')
  async setStatus(
    @Req() req: DeskRequest,
    @Param('source') source: string,
    @Param('id') id: string,
    @Body() body: { status?: string },
  ) {
    if (!SOURCES.has(source)) throw new BadRequestException('Unknown source.');
    if (!UUID_RE.test(id ?? '')) throw new BadRequestException('Invalid request id.');
    const status = body?.status;
    if (!status || !STATUSES.has(status)) throw new BadRequestException('Unknown status.');
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_set_marketplace_request_status', {
      p_workspace_id: context.workspaceId,
      p_member_id: context.workspaceMemberId,
      p_source: source,
      p_request_id: id,
      p_status: status,
    });
    if (error) {
      if (error.code === 'P0002') throw new NotFoundException('Request not found.');
      if (error.code === '42501') throw new ForbiddenException('Not a member of this workspace.');
      if (error.code === '22023') throw new BadRequestException(error.message ?? 'Invalid request.');
      throw error;
    }
    return data;
  }
}
