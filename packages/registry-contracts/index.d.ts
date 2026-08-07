export interface CanonicalRegistryReference<TEntityType extends string = string> {
  registryId: string;
  entityType: TEntityType;
}

export interface LocalRegistryIdentity<TEntityType extends string = string> {
  id: string;
  entityType: TEntityType;
}

export interface RegistryBinding<
  TLocalEntityType extends string = string,
  TCanonicalEntityType extends string = string,
> {
  local: LocalRegistryIdentity<TLocalEntityType>;
  canonical: CanonicalRegistryReference<TCanonicalEntityType> | null;
}

export declare function canonicalRegistryReference<TEntityType extends string>(
  registryId: string,
  entityType: TEntityType,
): CanonicalRegistryReference<TEntityType>;

export declare function localRegistryIdentity<TEntityType extends string>(
  id: string,
  entityType: TEntityType,
): LocalRegistryIdentity<TEntityType>;

export declare function registryBinding<
  TLocalEntityType extends string,
  TCanonicalEntityType extends string = string,
>(
  local: LocalRegistryIdentity<TLocalEntityType>,
  canonical?: CanonicalRegistryReference<TCanonicalEntityType> | null,
): RegistryBinding<TLocalEntityType, TCanonicalEntityType>;

export declare function isCanonicalRegistryReference(
  value: unknown,
): value is CanonicalRegistryReference;
