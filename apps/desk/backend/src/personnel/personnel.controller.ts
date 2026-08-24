import { Body, Controller, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequireDeskAuth, RequireDeskRoles } from '../auth/desk-auth.decorators';
import type { DeskAuthContext } from '../auth/desk-auth-context';
import { deskAdmin, supabaseAdmin, zosAdmin } from '../supabase/supabase-admin';

type DeskRequest = Request & { deskContext?: DeskAuthContext };

interface DayResolution {
  userId: string;
  date: string;
  status: 'working' | 'off' | 'absent';
  absenceType?: string;
  source: 'absence' | 'override' | 'schedule' | 'none';
}

function resolveDay(date: string, memberId: string, schedules: any[], overrides: any[], absences: any[]): DayResolution {
  const absence = absences.find((a) => a.member_id === memberId && a.start_date <= date && a.end_date >= date);
  if (absence) return { userId: memberId, date, status: 'absent', absenceType: absence.type, source: 'absence' };

  const override = overrides.find((o) => o.member_id === memberId && o.date === date);
  if (override) return { userId: memberId, date, status: override.start_time ? 'working' : 'off', source: 'override' };

  const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
  const scheduled = schedules.some((s) => s.member_id === memberId && s.day_of_week === dayOfWeek);
  return { userId: memberId, date, status: scheduled ? 'working' : 'off', source: scheduled ? 'schedule' : 'none' };
}

async function overtimeTotals(workspaceId: string, year: number, month: number, memberIds: string[]) {
  if (memberIds.length === 0) return {};
  const days = new Date(year, month, 0).getDate();
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${year}-${String(month).padStart(2, '0')}-${String(days).padStart(2, '0')}`;
  const { data, error } = await deskAdmin
    .from('overtime_entries')
    .select('member_id,hours')
    .eq('workspace_id', workspaceId)
    .eq('status', 'approved')
    .in('member_id', memberIds)
    .gte('date', start)
    .lte('date', end);
  if (error) throw error;
  return (data ?? []).reduce<Record<string, number>>((totals, entry) => {
    totals[entry.member_id] = (totals[entry.member_id] ?? 0) + Number(entry.hours);
    return totals;
  }, {});
}

@RequireDeskAuth()
@Controller('personnel')
export class PersonnelController {
  private selectMembers(context: DeskAuthContext, members: any[], requestedMemberId?: string) {
    const effectiveMemberId = context.role === 'member' ? context.workspaceMemberId : requestedMemberId;
    return effectiveMemberId ? members.filter((member) => member.id === effectiveMemberId) : members;
  }

  private async authorityData(workspaceId: string, start: string, end: string) {
    const [members, schedules, overrides, absences] = await Promise.all([
      deskAdmin.from('workspace_members').select('id,membership_id,role,preferred_language').eq('workspace_id', workspaceId).eq('status', 'active'),
      deskAdmin.from('work_schedules').select('member_id,day_of_week,start_time,end_time').eq('workspace_id', workspaceId),
      deskAdmin.from('schedule_overrides').select('member_id,date,start_time,end_time').eq('workspace_id', workspaceId).gte('date', start).lte('date', end),
      deskAdmin.from('absences').select('member_id,type,start_date,end_date').eq('workspace_id', workspaceId).eq('status', 'approved').lte('start_date', end).gte('end_date', start),
    ]);
    for (const result of [members, schedules, overrides, absences]) if (result.error) throw result.error;

    const memberRows = members.data ?? [];
    const membershipIds = memberRows.map((member) => member.membership_id);
    const names = new Map<string, string>();
    if (membershipIds.length > 0) {
      const { data: memberships, error: membershipError } = await zosAdmin
        .from('memberships')
        .select('id,person_id')
        .in('id', membershipIds);
      if (membershipError) throw membershipError;
      const personIds = (memberships ?? []).map((membership) => membership.person_id);
      if (personIds.length > 0) {
        const { data: people, error: peopleError } = await zosAdmin.from('persons').select('id,display_name').in('id', personIds);
        if (peopleError) throw peopleError;
        const personNames = new Map((people ?? []).map((person) => [person.id, person.display_name || 'Z Desk member']));
        for (const membership of memberships ?? []) names.set(membership.id, personNames.get(membership.person_id) || 'Z Desk member');
      }
    }

    return {
      members: memberRows.map((member) => ({ ...member, displayName: names.get(member.membership_id) || 'Z Desk member' })),
      schedules: schedules.data ?? [],
      overrides: overrides.data ?? [],
      absences: absences.data ?? [],
    };
  }

  @Get('weekly-view')
  async weeklyView(@Req() req: DeskRequest, @Query('weekStart') weekStart: string, @Query('memberId') memberId?: string) {
    const context = req.deskContext!;
    const start = new Date(`${weekStart}T00:00:00Z`);
    const weekDates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + index);
      return date.toISOString().slice(0, 10);
    });
    const data = await this.authorityData(context.workspaceId, weekStart, weekDates[6]);
    const selected = this.selectMembers(context, data.members, memberId);
    const selectedIds = selected.map((member) => member.id);
    let validationQuery = deskAdmin
      .from('schedule_validations')
      .select('id,member_id,status,validated_at')
      .eq('workspace_id', context.workspaceId)
      .eq('week_start_date', weekStart);
    if (selectedIds.length > 0) validationQuery = validationQuery.in('member_id', selectedIds);
    const { data: validations, error } = await validationQuery;
    if (error) throw error;
    const users = selected.map((member) => ({
      userId: member.id,
      displayName: member.displayName,
      email: member.displayName,
      days: weekDates.map((date) => resolveDay(date, member.id, data.schedules, data.overrides, data.absences)),
      validation: (validations ?? []).find((row) => row.member_id === member.id) ?? null,
    }));
    return { weekStart, weekDates, view: selected.length === 1 ? 'individual' : 'geral', peopleCount: users.length, users };
  }

  @Get('monthly-map')
  async monthlyMap(@Req() req: DeskRequest, @Query('year') year: string, @Query('month') month: string, @Query('memberId') memberId?: string) {
    const context = req.deskContext!;
    const y = Number(year);
    const m = Number(month);
    const count = new Date(y, m, 0).getDate();
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const end = `${y}-${String(m).padStart(2, '0')}-${String(count).padStart(2, '0')}`;
    const data = await this.authorityData(context.workspaceId, start, end);
    const selected = this.selectMembers(context, data.members, memberId);
    const selectedIds = selected.map((member) => member.id);
    const days = Array.from({ length: count }, (_, index) => {
      const date = `${y}-${String(m).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`;
      return { date, users: selected.map((member) => resolveDay(date, member.id, data.schedules, data.overrides, data.absences)) };
    });
    return {
      view: selected.length === 1 ? 'individual' : 'geral',
      peopleCount: selected.length,
      users: selected.map((member) => ({ id: member.id, displayName: member.displayName, email: member.displayName })),
      days,
      overtimeTotals: await overtimeTotals(context.workspaceId, y, m, selectedIds),
    };
  }

  @Get('workload-map')
  async workloadMap(@Req() req: DeskRequest, @Query('weekStart') weekStart: string) {
    const context = req.deskContext!;
    const startDate = new Date(`${weekStart}T00:00:00Z`);
    const dates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(startDate);
      date.setUTCDate(date.getUTCDate() + index);
      return date.toISOString().slice(0, 10);
    });
    const data = await this.authorityData(context.workspaceId, weekStart, dates[6]);
    const selected = this.selectMembers(context, data.members);
    const selectedIds = selected.map((member) => member.id);
    let taskQuery = deskAdmin
      .from('tasks')
      .select('assigned_to,task_type,status')
      .eq('workspace_id', context.workspaceId)
      .in('status', ['todo', 'in_progress']);
    if (selectedIds.length > 0) taskQuery = taskQuery.in('assigned_to', selectedIds);
    const { data: tasks, error } = await taskQuery;
    if (error) throw error;
    const workload = selected.map((member) => {
      const memberTasks = (tasks ?? []).filter((task) => task.assigned_to === member.id);
      const availability = dates.map((date) => resolveDay(date, member.id, data.schedules, data.overrides, data.absences));
      return {
        userId: member.id,
        displayName: member.displayName,
        email: member.displayName,
        tasksOpen: memberTasks.length,
        tasksInProgress: memberTasks.filter((task) => task.status === 'in_progress').length,
        missionsOpen: memberTasks.filter((task) => task.task_type === 'mission').length,
        availableDaysThisWeek: availability.filter((day) => day.status === 'working').length,
        absentDaysThisWeek: availability.filter((day) => day.status === 'absent').length,
      };
    });
    return { weekStart, weekEnd: dates[6], workload };
  }

  @Post('schedule/:memberId')
  @RequireDeskRoles('owner', 'admin')
  async replaceSchedule(@Req() req: DeskRequest, @Param('memberId') memberId: string, @Body('schedule') schedule: unknown) {
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_replace_work_schedule', {
      p_workspace_id: context.workspaceId, p_actor_member_id: context.workspaceMemberId, p_member_id: memberId, p_schedule: schedule,
    });
    if (error) throw error;
    return data;
  }

  @Post('absences')
  async requestAbsence(@Req() req: DeskRequest, @Body() body: { memberId?: string; type: string; startDate: string; endDate: string; note?: string }) {
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_request_absence', {
      p_workspace_id: context.workspaceId,
      p_actor_member_id: context.workspaceMemberId,
      p_member_id: body.memberId ?? context.workspaceMemberId,
      p_type: body.type,
      p_start_date: body.startDate,
      p_end_date: body.endDate,
      p_note: body.note ?? null,
    });
    if (error) throw error;
    return data;
  }

  @Post('absences/:id/decision')
  @RequireDeskRoles('owner', 'admin')
  async decideAbsence(@Req() req: DeskRequest, @Param('id') id: string, @Body('decision') decision: string) {
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_decide_absence', {
      p_workspace_id: context.workspaceId, p_actor_member_id: context.workspaceMemberId, p_absence_id: id, p_decision: decision,
    });
    if (error) throw error;
    return data;
  }

  @Delete('absences/:id')
  async cancelAbsence(@Req() req: DeskRequest, @Param('id') id: string) {
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_cancel_absence', {
      p_workspace_id: context.workspaceId, p_actor_member_id: context.workspaceMemberId, p_absence_id: id,
    });
    if (error) throw error;
    return data;
  }

  @Post('schedule-overrides/:memberId')
  @RequireDeskRoles('owner', 'admin')
  async upsertOverride(@Req() req: DeskRequest, @Param('memberId') memberId: string, @Body() body: { date: string; startTime?: string | null; endTime?: string | null; note?: string }) {
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_upsert_schedule_override', {
      p_workspace_id: context.workspaceId,
      p_actor_member_id: context.workspaceMemberId,
      p_member_id: memberId,
      p_date: body.date,
      p_start_time: body.startTime ?? null,
      p_end_time: body.endTime ?? null,
      p_note: body.note ?? null,
    });
    if (error) throw error;
    return data;
  }

  @Delete('schedule-overrides/:id')
  @RequireDeskRoles('owner', 'admin')
  async deleteOverride(@Req() req: DeskRequest, @Param('id') id: string) {
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_delete_schedule_override', {
      p_workspace_id: context.workspaceId, p_actor_member_id: context.workspaceMemberId, p_override_id: id,
    });
    if (error) throw error;
    return data;
  }

  @Post('schedule-validations/:memberId')
  @RequireDeskRoles('owner', 'admin')
  async validateWeek(@Req() req: DeskRequest, @Param('memberId') memberId: string, @Body('weekStart') weekStart: string) {
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_validate_schedule_week', {
      p_workspace_id: context.workspaceId, p_actor_member_id: context.workspaceMemberId, p_member_id: memberId, p_week_start: weekStart,
    });
    if (error) throw error;
    return data;
  }

  @Post('overtime')
  async submitOvertime(@Req() req: DeskRequest, @Body() body: { memberId?: string; date: string; hours: number; note?: string }) {
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_submit_overtime', {
      p_workspace_id: context.workspaceId,
      p_actor_member_id: context.workspaceMemberId,
      p_member_id: body.memberId ?? context.workspaceMemberId,
      p_date: body.date,
      p_hours: body.hours,
      p_note: body.note ?? null,
    });
    if (error) throw error;
    return data;
  }

  @Post('overtime/:id/decision')
  @RequireDeskRoles('owner', 'admin')
  async decideOvertime(@Req() req: DeskRequest, @Param('id') id: string, @Body('decision') decision: string) {
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_decide_overtime', {
      p_workspace_id: context.workspaceId, p_actor_member_id: context.workspaceMemberId, p_overtime_id: id, p_decision: decision,
    });
    if (error) throw error;
    return data;
  }

  @Delete('overtime/:id')
  async cancelOvertime(@Req() req: DeskRequest, @Param('id') id: string) {
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_cancel_overtime', {
      p_workspace_id: context.workspaceId, p_actor_member_id: context.workspaceMemberId, p_overtime_id: id,
    });
    if (error) throw error;
    return data;
  }
}
