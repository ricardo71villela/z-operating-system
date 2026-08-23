/**
 * Outbound WhatsApp messages via the Meta Cloud API. First place in Z Desk
 * that sends rather than only receives (see ADR-0007) — reuses the
 * tenant's existing WhatsApp Business integration (desk_integrations,
 * provider='whatsapp') as the sender, not a separate connection.
 */

const GRAPH_API_BASE = 'https://graph.facebook.com/v20.0';

export async function sendWhatsappTextMessage(
  phoneNumberId: string,
  accessToken: string,
  toNumber: string,
  body: string,
): Promise<{ messageId: string }> {
  const res = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toNumber,
      type: 'text',
      text: { body },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Falha ao enviar mensagem WhatsApp: ${res.status} ${errText}`);
  }

  const json = await res.json();
  return { messageId: json.messages?.[0]?.id ?? '' };
}
