import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequireDeskAuth } from '../auth/desk-auth.decorators';
import type { DeskAuthContext } from '../auth/desk-auth-context';
import { deskAdmin, supabaseAdmin } from '../supabase/supabase-admin';

type DeskRequest = Request & { deskContext?: DeskAuthContext };

@RequireDeskAuth()
@Controller('tasks')
export class TasksController {
  @Post()
  async create(
    @Req() req: DeskRequest,
    @Body()
    body: {
      title: string;
      description?: string;
      assignedTo?: string;
      dueDate?: string;
      threadId?: string;
    },
  ) {
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_create_task', {
      p_workspace_id: context.workspaceId,
      p_actor_member_id: context.workspaceMemberId,
      p_title: body.title,
      p_description: body.description ?? null,
      p_assigned_to: body.assignedTo ?? null,
      p_due_date: body.dueDate ?? null,
      p_thread_id: body.threadId ?? null,
    });
    if (error) throw error;
    return data;
  }

  @Get()
  async board(@Req() req: DeskRequest, @Query('assignedTo') assignedTo?: string) {
    const context = req.deskContext!;
    let query = deskAdmin
      .from('tasks')
      .select('id, title, description, created_by, assigned_to, task_type, status, due_date, thread_id, created_at')
      .eq('workspace_id', context.workspaceId)
      .order('created_at', { ascending: true });

    if (assignedTo) query = query.eq('assigned_to', assignedTo);
    const { data, error } = await query;
    if (error) throw error;
    return {
      todo: data.filter((task) => task.status === 'todo'),
      in_progress: data.filter((task) => task.status === 'in_progress'),
      done: data.filter((task) => task.status === 'done'),
    };
  }

  @Post(':id/move')
  async move(@Req() req: DeskRequest, @Param('id') id: string, @Body('status') status: string) {
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_move_task', {
      p_workspace_id: context.workspaceId,
      p_actor_member_id: context.workspaceMemberId,
      p_task_id: id,
      p_status: status,
    });
    if (error) throw error;
    return data;
  }

  @Post(':id/reassign')
  async reassign(@Req() req: DeskRequest, @Param('id') id: string, @Body('assignedTo') assignedTo: string) {
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_reassign_task', {
      p_workspace_id: context.workspaceId,
      p_actor_member_id: context.workspaceMemberId,
      p_task_id: id,
      p_assigned_to: assignedTo,
    });
    if (error) throw error;
    return data;
  }

  @Patch(':id')
  async update(
    @Req() req: DeskRequest,
    @Param('id') id: string,
    @Body() body: { title?: string; description?: string | null; dueDate?: string | null },
  ) {
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_update_task', {
      p_workspace_id: context.workspaceId,
      p_actor_member_id: context.workspaceMemberId,
      p_task_id: id,
      p_patch: body,
    });
    if (error) throw error;
    return data;
  }

  @Delete(':id')
  async remove(@Req() req: DeskRequest, @Param('id') id: string) {
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_delete_task', {
      p_workspace_id: context.workspaceId,
      p_actor_member_id: context.workspaceMemberId,
      p_task_id: id,
    });
    if (error) throw error;
    return data;
  }
}
