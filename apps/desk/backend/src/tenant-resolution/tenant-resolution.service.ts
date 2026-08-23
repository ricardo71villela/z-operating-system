import { supabaseAdmin } from '../supabase/supabase-admin';

export class UnknownChannelAccountError extends Error {
  constructor(provider: string, externalAccountId: string) {
    super(
      `Nenhum tenant ligado a ${provider}:${externalAccountId} — a conta não foi conectada via OAuth/onboarding, ou a integração foi desativada.`,
    );
    this.name = 'UnknownChannelAccountError';
  }
}

/**
 * Resolves the tenant that owns a given WhatsApp Business phone number.
 * `phoneNumberId` is Meta's phone_number_id from the webhook payload — the
 * business-side identifier, not the customer's number.
 *
 * A phone_number_id belongs to exactly one tenant by construction: the
 * onboarding flow (not built yet) writes one desk_integrations row per
 * connected WhatsApp number, enforced by uq_desk_integrations_provider_account.
 */
export async function resolveTenantForWhatsapp(phoneNumberId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('desk_integrations')
    .select('tenant_id')
    .eq('provider', 'whatsapp')
    .eq('external_account_id', phoneNumberId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new UnknownChannelAccountError('whatsapp', phoneNumberId);

  return data.tenant_id;
}

/**
 * Same resolution for a connected e-mail account (Gmail/Microsoft), keyed
 * by the mailbox address. Not yet called anywhere — email sync isn't built —
 * but kept alongside the WhatsApp resolver since both read the same table.
 */
export async function resolveTenantForEmailAccount(
  provider: 'gmail' | 'microsoft',
  mailboxAddress: string,
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('desk_integrations')
    .select('tenant_id')
    .eq('provider', provider)
    .eq('external_account_id', mailboxAddress)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new UnknownChannelAccountError(provider, mailboxAddress);

  return data.tenant_id;
}
