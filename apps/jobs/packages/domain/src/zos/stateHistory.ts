/**
 * ZOS v1.1 deliberately does NOT define one lifecycle for every entity.
 * This file standardises how domain-owned transitions are described/historyed.
 */
export interface StateTransition<TState extends string> {
  entityType: string;
  entityId: string;
  from: TState | null;
  to: TState;
  occurredAt: string;
  actorId?: string | null;
  reason?: string | null;
  correlationId?: string | null;
}

export function transitionRecord<TState extends string>(input: StateTransition<TState>): StateTransition<TState> {
  if (!input.entityType.trim()) throw new Error('entityType is required');
  if (!input.entityId.trim()) throw new Error('entityId is required');
  if (!input.to.trim()) throw new Error('target state is required');
  if (Number.isNaN(Date.parse(input.occurredAt))) throw new Error('occurredAt must be an ISO-compatible timestamp');
  return { ...input };
}
