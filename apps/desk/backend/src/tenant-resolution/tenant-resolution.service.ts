import { deskAdmin } from '../supabase/supabase-admin';

export class UnknownChannelAccountError extends Error {
  constructor(provider: string, externalAccountId: string) {
    super(
      `Nenhum workspace Z Desk ligado a ${provider}:${externalAccountId} — a integração não existe, está desligada ou não pertence a um workspace ativo.`,
    );
    this.name = 'UnknownChannelAccountError';
  }
}

export async function resolveWorkspaceForWhatsapp(phoneNumberId: string): Promise<string> {
  const { data, error } = await deskAdmin
    .from('integrations')
    .select('workspace_id')
    .eq('provider', 'whatsapp')
    .eq('external_account_id', phoneNumberId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw error;
  if (!data?.workspace_id) throw new UnknownChannelAccountError('whatsapp', phoneNumberId);

  return data.workspace_id;
}

export async function resolveWorkspaceForEmailAccount(
  provider: 'gmail' | 'microsoft',
  mailboxAddress: string,
): Promise<string> {
  const { data, error } = await deskAdmin
    .from('integrations')
    .select('workspace_id')
    .eq('provider', provider)
    .eq('external_account_id', mailboxAddress)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw error;
  if (!data?.workspace_id) throw new UnknownChannelAccountError(provider, mailboxAddress);

  return data.workspace_id;
}
