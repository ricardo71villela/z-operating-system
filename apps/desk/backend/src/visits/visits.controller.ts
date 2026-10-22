import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequireDeskAuth } from '../auth/desk-auth.decorators';
import type { DeskAuthContext } from '../auth/desk-auth-context';
import { supabaseAdmin } from '../supabase/supabase-admin';
import { sendVisitEmail, type VisitDecision } from './visit-email';

type DeskRequest = Request & { deskContext?: DeskAuthContext };

const STATUSES = new Set(['requested', 'confirmed', 'declined', 'cancelled']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapDecisionError(error: { code?: string; message?: string }): never {
  if (error.code === 'P0002') throw new NotFoundException('Visit request not found.');
  if (error.code === '55000') throw new ConflictException('Visit request already decided.');
  if (error.code === '23P01') throw new ConflictException('Another visit is already confirmed for this listing at that time.');
  if (error.code === '22023') throw new BadRequestException(error.message ?? 'Invalid visit decision.');
  throw error;
}

/**
 * Z Find visit requests for the caller's workspace (Z Desk Lite).
 * Workspace and member always come from the verified session, never
 * from the request body.
 */
@RequireDeskAuth()
@Controller('visits')
export class VisitsController {
  @Get()
  async list(@Req() req: DeskRequest, @Query('status') status?: string) {
    const context = req.deskContext!;
    if (status && !STATUSES.has(status)) throw new BadRequestException('Unknown status.');
    const { data, error } = await supabaseAdmin.rpc('zdesk_visit_requests', {
      p_workspace_id: context.workspaceId,
      p_status: status ?? null,
    });
    if (error) throw error;
    return data ?? [];
  }

  @Post(':id/confirm')
  async confirm(@Req() req: DeskRequest, @Param('id') id: string, @Body() body: { slotStart?: string }) {
    if (!UUID_RE.test(id ?? '')) throw new BadRequestException('Invalid visit request id.');
    const slot = body?.slotStart ? new Date(body.slotStart) : null;
    if (!slot || Number.isNaN(slot.getTime())) throw new BadRequestException('slotStart is required.');
    return this.decide(req.deskContext!, id, 'confirm', slot.toISOString(), null);
  }

  @Post(':id/decline')
  async decline(@Req() req: DeskRequest, @Param('id') id: string, @Body() body: { reason?: string }) {
    if (!UUID_RE.test(id ?? '')) throw new BadRequestException('Invalid visit request id.');
    const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 500) : null;
    return this.decide(req.deskContext!, id, 'decline', null, reason);
  }

  private async decide(context: DeskAuthContext, id: string, action: 'confirm' | 'decline', slotStart: string | null, reason: string | null) {
    const { data, error } = await supabaseAdmin.rpc('zdesk_decide_visit', {
      p_workspace_id: context.workspaceId,
      p_member_id: context.workspaceMemberId,
      p_request_id: id,
      p_action: action,
      p_slot_start: slotStart,
      p_reason: reason,
    });
    if (error) mapDecisionError(error);
    const decision = data as VisitDecision & { id: string; eventId: string | null };
    const notified = await sendVisitEmail(decision);
    if (notified) {
      const { error: markError } = await supabaseAdmin.rpc('zdesk_mark_visit_notified', {
        p_workspace_id: context.workspaceId,
        p_request_id: id,
      });
      if (markError) console.error('Z Desk: visit notified flag not saved', markError.message);
    }
    return { id: decision.id, status: decision.status, eventId: decision.eventId, buyerNotified: notified };
  }
}
