import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { supabaseAdmin } from '../supabase/supabase-admin';

/**
 * Personnel management (ADR-0004 + ADR-0005): recurring weekly schedules,
 * absences, per-week validation (T-15 days), and per-date overrides.
 *
 * Precedence when resolving a single day's status, used identically by
 * both weeklyView and monthlyMap: approved absence > override > recurring
 * schedule. See resolveDay().
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
   * A punctual deviation from the recurring pattern for one specific date.
   * start/endTime omitted (or explicitly null) means "off that day" —
   * enforced by the DB check constraint (both null or both set).
   */
  @Post('schedule-overrides')
  async createOverride(
    @Body()
    body: {
      tenantId: string;
      userId: string;
      date: string;
      startTime?: string | null;
      endTime?: string | null;
      note?: string;
    },
  ) {
    const { data, error } = await supabaseAdmin
      .from('desk_schedule_overrides')
      .upsert(
        {
          tenant_id: body.tenantId,
          user_id: body.userId,
          date: body.date,
          start_time: body.startTime ?? null,
          end_time: body.endTime ?? null,
          note: body.note ?? null,
        },
        { onConflict: 'tenant_id,user_id,date' },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /**
   * Validates a pending week — the human action per ADR-0005. Optionally
   * accepts overrides to create in the same call, since validating and
   * adjusting typically happen together (someone reviews the week and
   * either confirms it as-is or fixes the days that need to change).
   */
  @Post('schedule-validations/:id/validate')
  async validateWeek(
    @Param('id') id: string,
    @Body()
    body: {
      tenantId: string;
      validatedBy: string;
      overrides?: { date: string; startTime?: string | null; endTime?: string | null; note?: string }[];
    },
  ) {
    const { data: validation, error: readError } = await supabaseAdmin
      .from('desk_schedule_validations')
      .select('user_id')
      .eq('id', id)
      .eq('tenant_id', body.tenantId)
      .single();
    if (readError) throw readError;

    if (body.overrides?.length) {
      const rows = body.overrides.map((o) => ({
        tenant_id: body.tenantId,
        user_id: validation.user_id,
        date: o.date,
        start_time: o.startTime ?? null,
        end_time: o.endTime ?? null,
        note: o.note ?? null,
      }));
      const { error: overridesError } = await supabaseAdmin
        .from('desk_schedule_overrides')
        .upsert(rows, { onConflict: 'tenant_id,user_id,date' });
      if (overridesError) throw overridesError;
    }

    const { error } = await supabaseAdmin
      .from('desk_schedule_validations')
      .update({ status: 'validated', validated_at: new Date().toISOString(), validated_by: body.validatedBy })
      .eq('id', id)
      .eq('tenant_id', body.tenantId);
    if (error) throw error;

    return { validated: true };
  }

  /**
   * One week, per person, with each day already resolved through the
   * precedence rule (absence > override > recurring schedule), plus that
   * week's validation status per person. This is what the "vista semanal"
   * renders — nothing here is stored, all derived per request.
   */
  @Get('weekly-view')
  async weeklyView(@Query('tenantId') tenantId: string, @Query('weekStart') weekStart: string) {
    const start = new Date(weekStart + 'T00:00:00Z');
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    });
    const weekEnd = weekDates[6];

    const [usersRes, schedulesRes, overridesRes, absencesRes, validationsRes] = await Promise.all([
      supabaseAdmin.from('desk_users').select('id, email').eq('tenant_id', tenantId),
      supabaseAdmin.from('desk_work_schedules').select('user_id, day_of_week, start_time, end_time').eq('tenant_id', tenantId),
      supabaseAdmin.from('desk_schedule_overrides').select('user_id, date, start_time, end_time').eq('tenant_id', tenantId).gte('date', weekStart).lte('date', weekEnd),
      supabaseAdmin.from('desk_absences').select('user_id, type, start_date, end_date').eq('tenant_id', tenantId).eq('status', 'approved').lte('start_date', weekEnd).gte('end_date', weekStart),
      supabaseAdmin.from('desk_schedule_validations').select('id, user_id, status, validated_at').eq('tenant_id', tenantId).eq('week_start_date', weekStart),
    ]);

    for (const r of [usersRes, schedulesRes, overridesRes, absencesRes, validationsRes]) if (r.error) throw r.error;

    const users = usersRes.data.map((user) => {
      const days = weekDates.map((date) =>
        resolveDay(date, user.id, schedulesRes.data, overridesRes.data, absencesRes.data),
      );
      const validation = validationsRes.data.find((v) => v.user_id === user.id) ?? null;
      return { userId: user.id, email: user.email, days, validation };
    });

    return { weekStart, weekDates, users };
  }

  /**
   * Same precedence rule as weeklyView, extended across a whole month.
   * Extended from ADR-0004's version to also consult overrides — see
   * ADR-0005.
   */
  @Get('monthly-map')
  async monthlyMap(@Query('tenantId') tenantId: string, @Query('year') year: string, @Query('month') month: string) {
    const y = Number(year);
    const m = Number(month);
    const daysInMonth = new Date(y, m, 0).getDate();
    const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
    const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const [usersRes, schedulesRes, overridesRes, absencesRes] = await Promise.all([
      supabaseAdmin.from('desk_users').select('id, email').eq('tenant_id', tenantId),
      supabaseAdmin.from('desk_work_schedules').select('user_id, day_of_week, start_time, end_time').eq('tenant_id', tenantId),
      supabaseAdmin.from('desk_schedule_overrides').select('user_id, date, start_time, end_time').eq('tenant_id', tenantId).gte('date', monthStart).lte('date', monthEnd),
      supabaseAdmin.from('desk_absences').select('user_id, type, start_date, end_date').eq('tenant_id', tenantId).eq('status', 'approved').lte('start_date', monthEnd).gte('end_date', monthStart),
    ]);

    for (const r of [usersRes, schedulesRes, overridesRes, absencesRes]) if (r.error) throw r.error;

    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const date = `${y}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
      const perUser = usersRes.data.map((user) =>
        resolveDay(date, user.id, schedulesRes.data, overridesRes.data, absencesRes.data),
      );
      return { date, users: perUser };
    });

    return { users: usersRes.data, days };
  }
}

interface DayResolution {
  userId: string;
  date: string;
  status: 'working' | 'off' | 'absent';
  absenceType?: 'vacation' | 'sick' | 'other';
  source: 'absence' | 'override' | 'schedule' | 'none';
}

function resolveDay(
  date: string,
  userId: string,
  schedules: { user_id: string; day_of_week: number; start_time: string; end_time: string }[],
  overrides: { user_id: string; date: string; start_time: string | null; end_time: string | null }[],
  absences: { user_id: string; type: 'vacation' | 'sick' | 'other'; start_date: string; end_date: string }[],
): DayResolution {
  const absence = absences.find((a) => a.user_id === userId && a.start_date <= date && a.end_date >= date);
  if (absence) return { userId, date, status: 'absent', absenceType: absence.type, source: 'absence' };

  const override = overrides.find((o) => o.user_id === userId && o.date === date);
  if (override) {
    return { userId, date, status: override.start_time ? 'working' : 'off', source: 'override' };
  }

  const dayOfWeek = new Date(date + 'T00:00:00Z').getUTCDay();
  const scheduled = schedules.some((s) => s.user_id === userId && s.day_of_week === dayOfWeek);
  return { userId, date, status: scheduled ? 'working' : 'off', source: scheduled ? 'schedule' : 'none' };
}
