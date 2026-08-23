import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { deskAdmin } from '../supabase/supabase-admin';
import { RequireDeskAuth } from '../auth/desk-auth.decorators';

@RequireDeskAuth()
@Controller('tasks')
export class TasksController {
  @Post()
  async create(
    @Body()
    body: {
      workspaceId: string;
      title: string;
      description?: string;
      createdBy: string;
      assignedTo?: string;
      dueDate?: string;
      threadId?: string;
    },
  ) {
    const assignedTo = body.assignedTo ?? body.createdBy;
    const taskType = assignedTo === body.createdBy ? 'personal' : 'mission';

    const { data, error } = await deskAdmin
      .from('tasks')
      .insert({
        workspace_id: body.workspaceId,
        title: body.title,
        description: body.description ?? null,
        created_by: body.createdBy,
        assigned_to: assignedTo,
        task_type: taskType,
        due_date: body.dueDate ?? null,
        thread_id: body.threadId ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  @Get()
  async board(@Query('workspaceId') workspaceId: string, @Query('assignedTo') assignedTo?: string) {
    let query = deskAdmin
      .from('tasks')
      .select('id, title, description, created_by, assigned_to, task_type, status, due_date, thread_id, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true });

    if (assignedTo) query = query.eq('assigned_to', assignedTo);

    const { data, error } = await query;
    if (error) throw error;

    return {
      todo: data.filter((t) => t.status === 'todo'),
      in_progress: data.filter((t) => t.status === 'in_progress'),
      done: data.filter((t) => t.status === 'done'),
    };
  }

  @Post(':id/move')
  async move(@Param('id') id: string, @Body('workspaceId') workspaceId: string, @Body('status') status: string) {
    const { error } = await deskAdmin
      .from('tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('workspace_id', workspaceId);
    if (error) throw error;
    return { moved: true };
  }

  @Post(':id/reassign')
  async reassign(
    @Param('id') id: string,
    @Body('workspaceId') workspaceId: string,
    @Body('assignedTo') assignedTo: string,
  ) {
    const { data: task, error: readError } = await deskAdmin
      .from('tasks')
      .select('created_by')
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .single();
    if (readError) throw readError;

    const taskType = assignedTo === task.created_by ? 'personal' : 'mission';

    const { error } = await deskAdmin
      .from('tasks')
      .update({ assigned_to: assignedTo, task_type: taskType, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('workspace_id', workspaceId);
    if (error) throw error;
    return { reassigned: true, taskType };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body('workspaceId') workspaceId: string,
    @Body() body: { title?: string; description?: string; dueDate?: string },
  ) {
    const { workspaceId: _workspaceId, ...updates } = body as any;
    const { error } = await deskAdmin
      .from('tasks')
      .update({
        ...(updates.title !== undefined && { title: updates.title }),
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.dueDate !== undefined && { due_date: updates.dueDate }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', workspaceId);
    if (error) throw error;
    return { updated: true };
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Query('workspaceId') workspaceId: string) {
    const { error } = await deskAdmin.from('tasks').delete().eq('id', id).eq('workspace_id', workspaceId);
    if (error) throw error;
    return { deleted: true };
  }
}
