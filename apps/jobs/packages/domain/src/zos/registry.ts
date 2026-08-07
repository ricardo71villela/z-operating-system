/**
 * Compatibility boundary between Z Jobs and the future shared ZOS Registry.
 *
 * Z Jobs owns employment semantics. ZOS owns canonical cross-vertical identity.
 * These references let the Jobs domain point at ZOS identities without copying
 * the whole Registry implementation into this repository.
 */
export interface RegistryReference<TEntityType extends string = string> {
  registryId: string;
  entityType: TEntityType;
}

export type PersonRegistryReference = RegistryReference<'person'>;
export type OrganizationRegistryReference = RegistryReference<'organization'>;
export type LocationRegistryReference = RegistryReference<'location'>;

export function registryReference<TEntityType extends string>(
  registryId: string,
  entityType: TEntityType,
): RegistryReference<TEntityType> {
  const id = registryId.trim();
  if (!id) throw new Error('registryId is required');
  if (!entityType.trim()) throw new Error('entityType is required');
  return { registryId: id, entityType };
}
