import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { supabaseAdmin } from '../supabase/supabase-admin';

/**
 * Task board (ADR-0003): personal tasks and missions assigned to teammates,
 * organized in three status columns (todo / in_progress / done).
 *
 * task_type is derived once, at creation time, from whether assignedTo
 * differs from createdBy — 'mission' if assigned to someone else,
 * 'personal' otherwise — and stored rather than recomputed on every read.
 *
 * AUTH TODO: same caveat as every other controller in this backend —
 * createdBy/tenantId are accepted directly in the request body because
 * desk_users ↔ Supabase auth session wiring doesn't exist yet. Once it
 * does, createdBy must come from the authenticated session.
 */
@Controller('tasks')
export class TasksController {
  @Post()
  async create(
    @Body()
    body: {
      tenantId: string;
      title: string;
      description?: string;
      createdBy: string;
      assignedTo?: string; // defaults to createdBy → personal task
      dueDate?: string;
      threadId?: string;
    },
  ) {
    const assignedTo = body.assignedTo ?? body.createdBy;
    const taskType = assignedTo === body.createdBy ? 'personal' : 'mission';

    const { data, error } = await supabaseAdmin
      .from('desk_tasks')
      .insert({
        tenant_id: body.tenantId,
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

  /**
   * Board view: every task for the tenant, grouped by status column.
   * Optional `assignedTo` filter narrows to one person's board (personal
   * tasks + missions assigned to them) — the "quadro" the person asked
   * for is this endpoint's shape, not a separate one.
   */
  @Get()
  async board(@Query('tenantId') tenantId: string, @Query('assignedTo') assignedTo?: string) {
    let query = supabaseAdmin
      .from('desk_tasks')
      .select('id, title, description, created_by, assigned_to, task_type, status, due_date, thread_id, created_at')
      .eq('tenant_id', tenantId)
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
  async move(@Param('id') id: string, @Body('tenantId') tenantId: string, @Body('status') status: string) {
    const { error } = await supabaseAdmin
      .from('desk_tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) throw error;
    return { moved: true };
  }

  @Post(':id/reassign')
  async reassign(
    @Param('id') id: string,
    @Body('tenantId') tenantId: string,
    @Body('assignedTo') assignedTo: string,
  ) {
    // task_type is re-derived here against created_by, so reassigning a
    // personal task to a teammate correctly turns it into a mission (and
    // vice-versa) instead of leaving a stale label.
    const { data: task, error: readError } = await supabaseAdmin
      .from('desk_tasks')
      .select('created_by')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();
    if (readError) throw readError;

    const taskType = assignedTo === task.created_by ? 'personal' : 'mission';

    const { error } = await supabaseAdmin
      .from('desk_tasks')
      .update({ assigned_to: assignedTo, task_type: taskType, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) throw error;
    return { reassigned: true, taskType };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body('tenantId') tenantId: string,
    @Body() body: { title?: string; description?: string; dueDate?: string },
  ) {
    const { tenantId: _tenantId, ...updates } = body as any;
    const { error } = await supabaseAdmin
      .from('desk_tasks')
      .update({
        ...(updates.title !== undefined && { title: updates.title }),
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.dueDate !== undefined && { due_date: updates.dueDate }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) throw error;
    return { updated: true };
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Query('tenantId') tenantId: string) {
    const { error } = await supabaseAdmin.from('desk_tasks').delete().eq('id', id).eq('tenant_id', tenantId);
    if (error) throw error;
    return { deleted: true };
  }
}
