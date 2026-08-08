/**
 * Technical integration envelope. This is deliberately named Message, not
 * Event: ZOS v1.1 does not introduce a universal semantic Event model.
 */
export interface IntegrationMessage<TPayload = unknown> {
  messageId: string;
  messageType: string;
  producer: string;
  schemaVersion: number;
  occurredAt: string;
  correlationId: string;
  causationId?: string | null;
  subjectId?: string | null;
  subjectType?: string | null;
  payload: TPayload;
}

export function integrationMessage<TPayload>(message: IntegrationMessage<TPayload>): IntegrationMessage<TPayload> {
  if (!message.messageId.trim()) throw new Error('messageId is required');
  if (!message.messageType.trim()) throw new Error('messageType is required');
  if (!message.producer.trim()) throw new Error('producer is required');
  if (!message.correlationId.trim()) throw new Error('correlationId is required');
  if (!Number.isInteger(message.schemaVersion) || message.schemaVersion < 1) {
    throw new Error('schemaVersion must be a positive integer');
  }
  if (Number.isNaN(Date.parse(message.occurredAt))) throw new Error('occurredAt must be an ISO-compatible timestamp');
  return { ...message };
}
