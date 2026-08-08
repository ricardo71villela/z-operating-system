import {
  canonicalRegistryReference,
} from "@zos/registry-contracts";
import type {
  CanonicalRegistryReference,
} from "@zos/registry-contracts";

export type ZosOrganizationReference =
  CanonicalRegistryReference<"organization">;

export function zosOrganizationReference(
  registryId: string,
): ZosOrganizationReference {
  return canonicalRegistryReference(registryId, "organization");
}
