import { Controller, Get, Query } from '@nestjs/common';
import { RequireDeskAuth } from '../auth/desk-auth.decorators';
import { deskAdmin } from '../supabase/supabase-admin';

interface DayResolution {
  userId: string;
  date: string;
  status: 'working' | 'off' | 'absent';
  absenceType?: string;
  source: 'absence' | 'override' | 'schedule' | 'none';
}

function resolveDay(
  date: string,
  memberId: string,
  schedules: any[],
  overrides: any[],
  absences: any[],
): DayResolution {
  const absence = absences.find((a) => a.member_id === memberId && a.start_date <= date && a.end_date >= date);
  if (absence) return { userId: memberId, date, status: 'absent', absenceType: absence.type, source: 'absence' };

  const override = overrides.find((o) => o.member_id === memberId && o.date === date);
  if (override) return { userId: memberId, date, status: override.start_time ? 'working' : 'off', source: 'override' };

  const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
  const scheduled = schedules.some((s) => s.member_id === memberId && s.day_of_week === dayOfWeek);
  return { userId: memberId, date, status: scheduled ? 'working' : 'off', source: scheduled ? 'schedule' : 'none' };
}

async function overtimeTotals(workspaceId: string, year: number, month: number) {
  const days = new Date(year, month, 0).getDate();
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${year}-${String(month).padStart(2, '0')}-${String(days).padStart(2, '0')}`;
  const { data, error } = await deskAdmin
    .from('overtime_entries')
    .select('member_id,hours')
    .eq('workspace_id', workspaceId)
    .eq('status', 'approved')
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
  private async authorityData(workspaceId: string, start: string, end: string) {
    const [members, schedules, overrides, absences] = await Promise.all([
      deskAdmin.from('workspace_members').select('id,role,preferred_language').eq('workspace_id', workspaceId).eq('status', 'active'),
      deskAdmin.from('work_schedules').select('member_id,day_of_week,start_time,end_time').eq('workspace_id', workspaceId),
      deskAdmin.from('schedule_overrides').select('member_id,date,start_time,end_time').eq('workspace_id', workspaceId).gte('date', start).lte('date', end),
      deskAdmin.from('absences').select('member_id,type,start_date,end_date').eq('workspace_id', workspaceId).eq('status', 'approved').lte('start_date', end).gte('end_date', start),
    ]);
    for (const result of [members, schedules, overrides, absences]) if (result.error) throw result.error;
    return {
      members: members.data ?? [],
      schedules: schedules.data ?? [],
      overrides: overrides.data ?? [],
      absences: absences.data ?? [],
    };
  }

  @Get('weekly-view')
  async weeklyView(@Query('workspaceId') workspaceId: string, @Query('weekStart') weekStart: string, @Query('memberId') memberId?: string) {
    const start = new Date(`${weekStart}T00:00:00Z`);
    const weekDates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + index);
      return date.toISOString().slice(0, 10);
    });
    const data = await this.authorityData(workspaceId, weekStart, weekDates[6]);
    const selected = memberId ? data.members.filter((member) => member.id === memberId) : data.members;
    const { data: validations, error } = await deskAdmin
      .from('schedule_validations')
      .select('id,member_id,status,validated_at')
      .eq('workspace_id', workspaceId)
      .eq('week_start_date', weekStart);
    if (error) throw error;
    const users = selected.map((member) => ({
      userId: member.id,
      email: member.id,
      days: weekDates.map((date) => resolveDay(date, member.id, data.schedules, data.overrides, data.absences)),
      validation: (validations ?? []).find((row) => row.member_id === member.id) ?? null,
    }));
    return { weekStart, weekDates, view: memberId ? 'individual' : 'geral', peopleCount: users.length, users };
  }

  @Get('monthly-map')
  async monthlyMap(@Query('workspaceId') workspaceId: string, @Query('year') year: string, @Query('month') month: string, @Query('memberId') memberId?: string) {
    const y = Number(year);
    const m = Number(month);
    const count = new Date(y, m, 0).getDate();
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const end = `${y}-${String(m).padStart(2, '0')}-${String(count).padStart(2, '0')}`;
    const data = await this.authorityData(workspaceId, start, end);
    const selected = memberId ? data.members.filter((member) => member.id === memberId) : data.members;
    const days = Array.from({ length: count }, (_, index) => {
      const date = `${y}-${String(m).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`;
      return { date, users: selected.map((member) => resolveDay(date, member.id, data.schedules, data.overrides, data.absences)) };
    });
    return {
      view: memberId ? 'individual' : 'geral',
      peopleCount: selected.length,
      users: selected.map((member) => ({ id: member.id, email: member.id })),
      days,
      overtimeTotals: await overtimeTotals(workspaceId, y, m),
    };
  }

  @Get('workload-map')
  async workloadMap(@Query('workspaceId') workspaceId: string, @Query('weekStart') weekStart: string) {
    const startDate = new Date(`${weekStart}T00:00:00Z`);
    const dates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(startDate);
      date.setUTCDate(date.getUTCDate() + index);
      return date.toISOString().slice(0, 10);
    });
    const data = await this.authorityData(workspaceId, weekStart, dates[6]);
    const { data: tasks, error } = await deskAdmin
      .from('tasks')
      .select('assigned_to,task_type,status')
      .eq('workspace_id', workspaceId)
      .in('status', ['todo', 'in_progress']);
    if (error) throw error;
    const workload = data.members.map((member) => {
      const memberTasks = (tasks ?? []).filter((task) => task.assigned_to === member.id);
      const availability = dates.map((date) => resolveDay(date, member.id, data.schedules, data.overrides, data.absences));
      return {
        userId: member.id,
        email: member.id,
        tasksOpen: memberTasks.length,
        tasksInProgress: memberTasks.filter((task) => task.status === 'in_progress').length,
        missionsOpen: memberTasks.filter((task) => task.task_type === 'mission').length,
        availableDaysThisWeek: availability.filter((day) => day.status === 'working').length,
        absentDaysThisWeek: availability.filter((day) => day.status === 'absent').length,
      };
    });
    return { weekStart, weekEnd: dates[6], workload };
  }
}
