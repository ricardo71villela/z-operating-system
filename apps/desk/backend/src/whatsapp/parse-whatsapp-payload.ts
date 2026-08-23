/**
 * Meta WhatsApp Business Cloud API sends a nested payload per webhook call.
 * This parser extracts only what tenant resolution + message ingestion need,
 * and returns null for events that are not an inbound text message (e.g.
 * delivery/read status callbacks), which the worker should ignore.
 *
 * Real payload shape (relevant subset):
 * {
 *   entry: [{ changes: [{ value: {
 *     metadata: { phone_number_id },
 *     contacts: [{ profile: { name }, wa_id }],
 *     messages: [{ from, id, timestamp, type, text: { body } }]
 *   }}]}]
 * }
 */
export interface ParsedWhatsappMessage {
  phoneNumberId: string; // identifies which business number received it → maps to desk_integrations
  waId: string; // sender's WhatsApp number → maps to desk_contacts.whatsapp_number
  contactName: string | null;
  body: string;
  externalMessageId: string;
  timestamp: string; // ISO 8601
}

export function parseWhatsappMessage(payload: unknown): ParsedWhatsappMessage | null {
  const value = (payload as any)?.entry?.[0]?.changes?.[0]?.value;
  if (!value) return null;

  const message = value.messages?.[0];
  if (!message) return null; // status callback (sent/delivered/read), not an inbound message

  const phoneNumberId = value.metadata?.phone_number_id;
  const waId = message.from;
  if (!phoneNumberId || !waId) return null;

  const contact = (value.contacts ?? []).find((c: any) => c.wa_id === waId);

  // Only plain text is handled in the foundation branch. Media/voice notes
  // (needed for the "voice note → note" idea from ADR-0002) require a
  // separate download + transcription step — tracked, not implemented here.
  const body = message.type === 'text' ? (message.text?.body ?? '') : '';

  return {
    phoneNumberId,
    waId,
    contactName: contact?.profile?.name ?? null,
    body,
    externalMessageId: message.id,
    timestamp: message.timestamp
      ? new Date(Number(message.timestamp) * 1000).toISOString()
      : new Date().toISOString(),
  };
}
