import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { supabaseAdmin } from '../supabase/supabase-admin';

/**
 * Personnel management (ADR-0004): recurring weekly work schedules +
 * absences (vacation/sick/other). Deliberately thin — no approval
 * hierarchy, no payroll integration, no holiday calendar. Exists to feed
 * availability into task assignment and calendar suggestions elsewhere
 * in the product, not to be a standalone HR module.
 */
@Controller('personnel')
export class PersonnelController {
  @Post('schedules')
  async createSchedule(
    @Body()
    body: { tenantId: string; userId: string; dayOfWeek: number; startTime: string; endTime: string },
  ) {
    const { data, error } = await supabaseAdmin
      .from('desk_work_schedules')
      .insert({
        tenant_id: body.tenantId,
        user_id: body.userId,
        day_of_week: body.dayOfWeek,
        start_time: body.startTime,
        end_time: body.endTime,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  @Get('schedules')
  async listSchedules(@Query('tenantId') tenantId: string, @Query('userId') userId?: string) {
    let query = supabaseAdmin
      .from('desk_work_schedules')
      .select('id, user_id, day_of_week, start_time, end_time')
      .eq('tenant_id', tenantId)
      .order('day_of_week', { ascending: true });
    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  @Delete('schedules/:id')
  async removeSchedule(@Param('id') id: string, @Query('tenantId') tenantId: string) {
    const { error } = await supabaseAdmin
      .from('desk_work_schedules')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) throw error;
    return { deleted: true };
  }

  @Post('absences')
  async createAbsence(
    @Body()
    body: {
      tenantId: string;
      userId: string;
      type: 'vacation' | 'sick' | 'other';
      startDate: string;
      endDate: string;
      note?: string;
    },
  ) {
    const { data, error } = await supabaseAdmin
      .from('desk_absences')
      .insert({
        tenant_id: body.tenantId,
        user_id: body.userId,
        type: body.type,
        start_date: body.startDate,
        end_date: body.endDate,
        note: body.note ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  @Post('absences/:id/approve')
  async approveAbsence(@Param('id') id: string, @Body('tenantId') tenantId: string) {
    const { error } = await supabaseAdmin
      .from('desk_absences')
      .update({ status: 'approved' })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) throw error;
    return { approved: true };
  }

  @Delete('absences/:id')
  async removeAbsence(@Param('id') id: string, @Query('tenantId') tenantId: string) {
    const { error } = await supabaseAdmin.from('desk_absences').delete().eq('id', id).eq('tenant_id', tenantId);
    if (error) throw error;
    return { deleted: true };
  }

  /**
   * The "mapa mensal" the person asked for: for every day in the given
   * month, every team member's recurring schedule for that weekday,
   * overridden by any approved absence covering that date. This is
   * computed here, not stored — it's a derived view over the two tables,
   * so there is nothing to keep in sync when a schedule or absence changes.
   */
  @Get('monthly-map')
  async monthlyMap(@Query('tenantId') tenantId: string, @Query('year') year: string, @Query('month') month: string) {
    const y = Number(year);
    const m = Number(month); // 1-12
    const daysInMonth = new Date(y, m, 0).getDate();
    const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
    const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const [usersRes, schedulesRes, absencesRes] = await Promise.all([
      supabaseAdmin.from('desk_users').select('id, email').eq('tenant_id', tenantId),
      supabaseAdmin
        .from('desk_work_schedules')
        .select('user_id, day_of_week, start_time, end_time')
        .eq('tenant_id', tenantId),
      supabaseAdmin
        .from('desk_absences')
        .select('user_id, type, status, start_date, end_date')
        .eq('tenant_id', tenantId)
        .eq('status', 'approved')
        .lte('start_date', monthEnd)
        .gte('end_date', monthStart),
    ]);

    if (usersRes.error) throw usersRes.error;
    if (schedulesRes.error) throw schedulesRes.error;
    if (absencesRes.error) throw absencesRes.error;

    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const date = `${y}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
      const dayOfWeek = new Date(y, m - 1, i + 1).getDay();

      const perUser = usersRes.data.map((user) => {
        const absence = absencesRes.data.find(
          (a) => a.user_id === user.id && a.start_date <= date && a.end_date >= date,
        );
        if (absence) return { userId: user.id, status: 'absent', absenceType: absence.type };

        const scheduled = schedulesRes.data.some((s) => s.user_id === user.id && s.day_of_week === dayOfWeek);
        return { userId: user.id, status: scheduled ? 'working' : 'off' };
      });

      return { date, dayOfWeek, users: perUser };
    });

    return { users: usersRes.data, days };
  }
}
