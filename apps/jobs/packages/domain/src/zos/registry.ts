/**
 * Compatibility boundary between Z Jobs and the shared ZOS Registry.
 *
 * Z Jobs owns employment semantics. ZOS owns canonical cross-vertical identity.
 * This module preserves the existing Z Jobs API while delegating the shared
 * canonical reference contract to @zos/registry-contracts.
 */
import {
  canonicalRegistryReference,
} from "@zos/registry-contracts";
import type {
  CanonicalRegistryReference,
} from "@zos/registry-contracts";

export type RegistryReference<TEntityType extends string = string> =
  CanonicalRegistryReference<TEntityType>;

export type PersonRegistryReference = RegistryReference<"person">;
export type OrganizationRegistryReference = RegistryReference<"organization">;
export type LocationRegistryReference = RegistryReference<"location">;

export function registryReference<TEntityType extends string>(
  registryId: string,
  entityType: TEntityType,
): RegistryReference<TEntityType> {
  return canonicalRegistryReference(registryId, entityType);
}
