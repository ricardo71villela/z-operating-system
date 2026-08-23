import { Controller, Get, Query } from '@nestjs/common';
import { supabaseAdmin } from '../supabase/supabase-admin';

/**
 * Backs the "hoje" (today) view described in ADR-0002: eventos confirmados
 * + sugestões de evento pendentes + threads que precisam de resposta, numa
 * só lista — em vez de três painéis separados que o utilizador tem de
 * cruzar mentalmente.
 *
 * This endpoint only assembles the three raw lists; the "importância real"
 * ranking that merges them into one ordered feed is a UI/product decision
 * not yet made — the frontend renders three grouped sections for now
 * rather than a single interleaved ranking it can't yet justify.
 *
 * AUTH TODO: same caveat as IntegrationsController — tenantId should come
 * from the authenticated session once desk_users ↔ Supabase auth exists.
 */
@Controller('today')
export class TodayController {
  @Get()
  async getToday(@Query('tenantId') tenantId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const [pendingMessages, draftEvents, confirmedEventsToday] = await Promise.all([
      supabaseAdmin
        .from('desk_messages')
        .select('id, thread_id, body, ai_summary, state, received_at')
        .eq('tenant_id', tenantId)
        .neq('state', 'resolved')
        .order('received_at', { ascending: false }),

      supabaseAdmin
        .from('desk_events')
        .select('id, thread_id, title, starts_at, ends_at, event_type, confidence_score')
        .eq('tenant_id', tenantId)
        .eq('status', 'draft')
        .order('starts_at', { ascending: true }),

      supabaseAdmin
        .from('desk_events')
        .select('id, thread_id, title, starts_at, ends_at, event_type')
        .eq('tenant_id', tenantId)
        .eq('status', 'confirmed')
        .gte('starts_at', startOfDay.toISOString())
        .lte('starts_at', endOfDay.toISOString())
        .order('starts_at', { ascending: true }),
    ]);

    if (pendingMessages.error) throw pendingMessages.error;
    if (draftEvents.error) throw draftEvents.error;
    if (confirmedEventsToday.error) throw confirmedEventsToday.error;

    return {
      pendingMessages: pendingMessages.data,
      draftEvents: draftEvents.data,
      confirmedEventsToday: confirmedEventsToday.data,
    };
  }
}
