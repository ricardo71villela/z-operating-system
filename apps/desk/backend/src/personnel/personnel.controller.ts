import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { supabaseAdmin } from '../supabase/supabase-admin';
import { sendWhatsappTextMessage } from '../whatsapp/whatsapp-sender.client';
import { getScheduleMessageStrings } from '../whatsapp/schedule-message-translations';

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
      type: 'vacation' | 'sick' | 'other' | 'falta_justificada' | 'falta_injustificada';
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
   * Overtime entries (ADR-0006) — additive to the schedule, never
   * recalculates it. Only 'approved' entries count toward the monthly
   * total (see monthlyMap and the dedicated total endpoint below); a
   * 'pending' entry exists but isn't counted until approved.
   */
  @Post('overtime')
  async createOvertime(
    @Body() body: { tenantId: string; userId: string; date: string; hours: number; note?: string },
  ) {
    const { data, error } = await supabaseAdmin
      .from('desk_overtime_entries')
      .insert({
        tenant_id: body.tenantId,
        user_id: body.userId,
        date: body.date,
        hours: body.hours,
        note: body.note ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  @Get('overtime')
  async listOvertime(
    @Query('tenantId') tenantId: string,
    @Query('userId') userId?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    let query = supabaseAdmin
      .from('desk_overtime_entries')
      .select('id, user_id, date, hours, note, status, approved_at')
      .eq('tenant_id', tenantId)
      .order('date', { ascending: false });

    if (userId) query = query.eq('user_id', userId);
    if (year && month) {
      const y = Number(year);
      const m = Number(month);
      const daysInMonth = new Date(y, m, 0).getDate();
      query = query
        .gte('date', `${y}-${String(m).padStart(2, '0')}-01`)
        .lte('date', `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  @Post('overtime/:id/approve')
  async approveOvertime(
    @Param('id') id: string,
    @Body('tenantId') tenantId: string,
    @Body('approvedBy') approvedBy: string,
  ) {
    const { error } = await supabaseAdmin
      .from('desk_overtime_entries')
      .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: approvedBy })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) throw error;
    return { approved: true };
  }

  @Delete('overtime/:id')
  async removeOvertime(@Param('id') id: string, @Query('tenantId') tenantId: string) {
    const { error } = await supabaseAdmin
      .from('desk_overtime_entries')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) throw error;
    return { deleted: true };
  }

  /**
   * The "contabilização no fim do mês" the person asked for: total
   * approved overtime hours per person for one month. Summed on request
   * from desk_overtime_entries, same non-stored-derived-value pattern as
   * every other view in this controller. monthlyMap below embeds this
   * same total per person so it shows up alongside the calendar map
   * without a second round trip.
   */
  @Get('overtime/monthly-total')
  async overtimeMonthlyTotal(@Query('tenantId') tenantId: string, @Query('year') year: string, @Query('month') month: string) {
    const totals = await computeOvertimeTotals(tenantId, year, month);
    return totals;
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

    // ADR-0007: automatic, best-effort — a failed/skipped send never
    // un-does the validation itself.
    try {
      await this.exportScheduleWhatsapp(body.tenantId, validation.user_id, id, true);
    } catch (err) {
      console.warn(`Falha ao exportar horário por WhatsApp (validação ${id}):`, err);
    }

    return { validated: true };
  }

  /**
   * Manual re-send — same underlying logic as the automatic export
   * triggered by validateWeek, callable on demand without waiting for a
   * new validation cycle.
   */
  @Post('schedules/:userId/export-whatsapp')
  async exportWhatsapp(
    @Param('userId') userId: string,
    @Body('tenantId') tenantId: string,
    @Body('weekStart') weekStart: string,
  ) {
    const { data: validation } = await supabaseAdmin
      .from('desk_schedule_validations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .eq('week_start_date', weekStart)
      .maybeSingle();

    await this.exportScheduleWhatsapp(tenantId, userId, validation?.id ?? null, false, weekStart);
    return { sent: true };
  }

  /**
   * Builds the week's schedule as plain text and sends it via the
   * tenant's connected WhatsApp Business number to the person's own
   * whatsapp_number. Silently no-ops (throws, caught by caller in the
   * automatic path) if either is missing — see ADR-0007: infrastructure
   * gaps never block the human validation action itself.
   */
  private async exportScheduleWhatsapp(
    tenantId: string,
    userId: string,
    validationId: string | null,
    resolveWeekFromValidation: boolean,
    explicitWeekStart?: string,
  ) {
    let weekStart = explicitWeekStart ?? null;
    if (resolveWeekFromValidation && validationId) {
      const { data } = await supabaseAdmin
        .from('desk_schedule_validations')
        .select('week_start_date')
        .eq('id', validationId)
        .single();
      weekStart = data?.week_start_date ?? null;
    }
    if (!weekStart) throw new Error('Sem semana para exportar.');

    const { data: user, error: userError } = await supabaseAdmin
      .from('desk_users')
      .select('id, tenant_id, whatsapp_number, preferred_language')
      .eq('id', userId)
      .single();
    if (userError) throw userError;
    if (!user.whatsapp_number) throw new Error(`Utilizador ${userId} sem whatsapp_number associado.`);

    const { data: integration, error: integrationError } = await supabaseAdmin
      .from('desk_integrations')
      .select('external_account_id, oauth_tokens')
      .eq('tenant_id', tenantId)
      .eq('provider', 'whatsapp')
      .eq('status', 'active')
      .maybeSingle();
    if (integrationError) throw integrationError;
    if (!integration?.oauth_tokens?.accessToken) throw new Error('Sem integração WhatsApp ativa para o tenant.');

    const start = new Date(weekStart + 'T00:00:00Z');
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    });
    const weekEnd = weekDates[6];

    const [schedulesRes, overridesRes, absencesRes] = await Promise.all([
      supabaseAdmin.from('desk_work_schedules').select('user_id, day_of_week, start_time, end_time').eq('tenant_id', tenantId).eq('user_id', userId),
      supabaseAdmin.from('desk_schedule_overrides').select('user_id, date, start_time, end_time').eq('tenant_id', tenantId).eq('user_id', userId).gte('date', weekStart).lte('date', weekEnd),
      supabaseAdmin.from('desk_absences').select('user_id, type, start_date, end_date').eq('tenant_id', tenantId).eq('user_id', userId).eq('status', 'approved').lte('start_date', weekEnd).gte('end_date', weekStart),
    ]);
    for (const r of [schedulesRes, overridesRes, absencesRes]) if (r.error) throw r.error;
    const schedules = schedulesRes.data ?? [];
    const overrides = overridesRes.data ?? [];
    const absences = absencesRes.data ?? [];

    const strings = getScheduleMessageStrings(user.preferred_language);
    const lines = weekDates.map((date) => {
      const resolution = resolveDay(date, userId, schedules, overrides, absences);
      const dow = new Date(date + 'T00:00:00Z').getUTCDay();
      const label = strings.dayNames[dow];
      if (resolution.status === 'absent') return `${label} ${date.slice(8, 10)}: ${strings.absent}`;
      if (resolution.status === 'working') {
        const schedule = schedules.find((s) => s.day_of_week === dow);
        const override = overrides.find((o) => o.date === date);
        const times = override ?? schedule;
        return `${label} ${date.slice(8, 10)}: ${times?.start_time?.slice(0, 5)}–${times?.end_time?.slice(0, 5)}`;
      }
      return `${label} ${date.slice(8, 10)}: ${strings.off}`;
    });

    const message = `${strings.header(weekStart)}\n\n${lines.join('\n')}`;

    await sendWhatsappTextMessage(
      integration.external_account_id,
      integration.oauth_tokens.accessToken,
      user.whatsapp_number,
      message,
    );
  }

  /**
   * One week, per person, with each day already resolved through the
   * precedence rule (absence > override > recurring schedule), plus that
   * week's validation status per person. This is what the "vista semanal"
   * renders — nothing here is stored, all derived per request.
   *
   * userId is optional: omitted → "geral" (every person in the tenant,
   * however many that is — never a fixed count); provided → the
   * individual view for that one person. Both read from the same
   * desk_users query, so the roster (however many people are on the
   * personnel board) and the schedule views are always in sync — adding
   * or removing a person changes both automatically, nothing to keep in
   * step manually.
   */
  @Get('weekly-view')
  async weeklyView(
    @Query('tenantId') tenantId: string,
    @Query('weekStart') weekStart: string,
    @Query('userId') userId?: string,
  ) {
    const start = new Date(weekStart + 'T00:00:00Z');
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    });
    const weekEnd = weekDates[6];

    let usersQuery = supabaseAdmin.from('desk_users').select('id, email').eq('tenant_id', tenantId);
    if (userId) usersQuery = usersQuery.eq('id', userId);

    const [usersRes, schedulesRes, overridesRes, absencesRes, validationsRes] = await Promise.all([
      usersQuery,
      supabaseAdmin.from('desk_work_schedules').select('user_id, day_of_week, start_time, end_time').eq('tenant_id', tenantId),
      supabaseAdmin.from('desk_schedule_overrides').select('user_id, date, start_time, end_time').eq('tenant_id', tenantId).gte('date', weekStart).lte('date', weekEnd),
      supabaseAdmin.from('desk_absences').select('user_id, type, start_date, end_date').eq('tenant_id', tenantId).eq('status', 'approved').lte('start_date', weekEnd).gte('end_date', weekStart),
      supabaseAdmin.from('desk_schedule_validations').select('id, user_id, status, validated_at').eq('tenant_id', tenantId).eq('week_start_date', weekStart),
    ]);

    for (const r of [usersRes, schedulesRes, overridesRes, absencesRes, validationsRes]) if (r.error) throw r.error;
    const weeklyUsers = usersRes.data ?? [];
    const schedules = schedulesRes.data ?? [];
    const overrides = overridesRes.data ?? [];
    const absences = absencesRes.data ?? [];
    const validations = validationsRes.data ?? [];

    const users = weeklyUsers.map((user) => {
      const days = weekDates.map((date) => resolveDay(date, user.id, schedules, overrides, absences));
      const validation = validations.find((v) => v.user_id === user.id) ?? null;
      return { userId: user.id, email: user.email, days, validation };
    });

    return { weekStart, weekDates, view: userId ? 'individual' : 'geral', peopleCount: users.length, users };
  }

  /**
   * Same precedence rule as weeklyView, extended across a whole month.
   * Same userId filter logic as weeklyView — omitted = geral (todo o
   * quadro de pessoal, sem número fixo), provided = individual.
   */
  @Get('monthly-map')
  async monthlyMap(
    @Query('tenantId') tenantId: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('userId') userId?: string,
  ) {
    const y = Number(year);
    const m = Number(month);
    const daysInMonth = new Date(y, m, 0).getDate();
    const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
    const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    let usersQuery = supabaseAdmin.from('desk_users').select('id, email').eq('tenant_id', tenantId);
    if (userId) usersQuery = usersQuery.eq('id', userId);

    const [usersRes, schedulesRes, overridesRes, absencesRes] = await Promise.all([
      usersQuery,
      supabaseAdmin.from('desk_work_schedules').select('user_id, day_of_week, start_time, end_time').eq('tenant_id', tenantId),
      supabaseAdmin.from('desk_schedule_overrides').select('user_id, date, start_time, end_time').eq('tenant_id', tenantId).gte('date', monthStart).lte('date', monthEnd),
      supabaseAdmin.from('desk_absences').select('user_id, type, start_date, end_date').eq('tenant_id', tenantId).eq('status', 'approved').lte('start_date', monthEnd).gte('end_date', monthStart),
    ]);

    for (const r of [usersRes, schedulesRes, overridesRes, absencesRes]) if (r.error) throw r.error;
    const monthlyUsers = usersRes.data ?? [];
    const monthlySchedules = schedulesRes.data ?? [];
    const monthlyOverrides = overridesRes.data ?? [];
    const monthlyAbsences = absencesRes.data ?? [];

    const overtimeTotals = await computeOvertimeTotals(tenantId, year, month);

    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const date = `${y}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
      const perUser = monthlyUsers.map((user) =>
        resolveDay(date, user.id, monthlySchedules, monthlyOverrides, monthlyAbsences),
      );
      return { date, users: perUser };
    });

    return {
      view: userId ? 'individual' : 'geral',
      peopleCount: monthlyUsers.length,
      users: monthlyUsers,
      days,
      overtimeTotals, // { [userId]: totalHoursApproved } — ver ADR-0006
    };
  }

  /**
   * Cross-references the task board (ADR-0003) with personnel availability
   * (ADR-0004/0005) for one week — the two were separate views until now.
   * Returns raw counts per person, not a pre-baked "overloaded" flag:
   * where the threshold sits (e.g. "2+ in-progress missions and ≤2
   * available days = flag it") is a product/UI decision, not something to
   * hardcode into this endpoint.
   */
  @Get('workload-map')
  async workloadMap(@Query('tenantId') tenantId: string, @Query('weekStart') weekStart: string) {
    const start = new Date(weekStart + 'T00:00:00Z');
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    });
    const weekEnd = weekDates[6];

    const [usersRes, tasksRes, schedulesRes, overridesRes, absencesRes] = await Promise.all([
      supabaseAdmin.from('desk_users').select('id, email').eq('tenant_id', tenantId),
      supabaseAdmin
        .from('desk_tasks')
        .select('assigned_to, task_type, status')
        .eq('tenant_id', tenantId)
        .in('status', ['todo', 'in_progress']),
      supabaseAdmin.from('desk_work_schedules').select('user_id, day_of_week, start_time, end_time').eq('tenant_id', tenantId),
      supabaseAdmin.from('desk_schedule_overrides').select('user_id, date, start_time, end_time').eq('tenant_id', tenantId).gte('date', weekStart).lte('date', weekEnd),
      supabaseAdmin.from('desk_absences').select('user_id, type, start_date, end_date').eq('tenant_id', tenantId).eq('status', 'approved').lte('start_date', weekEnd).gte('end_date', weekStart),
    ]);
    for (const r of [usersRes, tasksRes, schedulesRes, overridesRes, absencesRes]) if (r.error) throw r.error;

    const users = usersRes.data ?? [];
    const tasks = tasksRes.data ?? [];
    const schedules = schedulesRes.data ?? [];
    const overrides = overridesRes.data ?? [];
    const absences = absencesRes.data ?? [];

    const workload = users.map((user) => {
      const userTasks = tasks.filter((t) => t.assigned_to === user.id);
      const days = weekDates.map((date) => resolveDay(date, user.id, schedules, overrides, absences));

      return {
        userId: user.id,
        email: user.email,
        tasksOpen: userTasks.length,
        tasksInProgress: userTasks.filter((t) => t.status === 'in_progress').length,
        missionsOpen: userTasks.filter((t) => t.task_type === 'mission').length,
        availableDaysThisWeek: days.filter((d) => d.status === 'working').length,
        absentDaysThisWeek: days.filter((d) => d.status === 'absent').length,
      };
    });

    return { weekStart, weekEnd, workload };
  }
}


/**
 * Shared by monthlyMap and the standalone overtime/monthly-total endpoint,
 * so both always report the same number for the same tenant/month.
 */
async function computeOvertimeTotals(
  tenantId: string,
  year: string,
  month: string,
): Promise<Record<string, number>> {
  const y = Number(year);
  const m = Number(month);
  const daysInMonth = new Date(y, m, 0).getDate();
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
  const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  const { data, error } = await supabaseAdmin
    .from('desk_overtime_entries')
    .select('user_id, hours')
    .eq('tenant_id', tenantId)
    .eq('status', 'approved')
    .gte('date', monthStart)
    .lte('date', monthEnd);
  if (error) throw error;

  const totals: Record<string, number> = {};
  for (const entry of data ?? []) {
    totals[entry.user_id] = (totals[entry.user_id] ?? 0) + Number(entry.hours);
  }
  return totals;
}

interface DayResolution {
  userId: string;
  date: string;
  status: 'working' | 'off' | 'absent';
  absenceType?: 'vacation' | 'sick' | 'other' | 'falta_justificada' | 'falta_injustificada';
  source: 'absence' | 'override' | 'schedule' | 'none';
}

function resolveDay(
  date: string,
  userId: string,
  schedules: { user_id: string; day_of_week: number; start_time: string; end_time: string }[],
  overrides: { user_id: string; date: string; start_time: string | null; end_time: string | null }[],
  absences: { user_id: string; type: 'vacation' | 'sick' | 'other' | 'falta_justificada' | 'falta_injustificada'; start_date: string; end_date: string }[],
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
