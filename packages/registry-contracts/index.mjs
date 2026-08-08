function required(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

export function canonicalRegistryReference(registryId, entityType) {
  return Object.freeze({
    registryId: required(registryId, "registryId"),
    entityType: required(entityType, "entityType"),
  });
}

export function localRegistryIdentity(id, entityType) {
  return Object.freeze({
    id: required(id, "id"),
    entityType: required(entityType, "entityType"),
  });
}

export function registryBinding(local, canonical = null) {
  if (!local || typeof local !== "object") throw new Error("local identity is required");
  const normalizedLocal = localRegistryIdentity(local.id, local.entityType);
  const normalizedCanonical = canonical === null
    ? null
    : canonicalRegistryReference(canonical.registryId, canonical.entityType);

  return Object.freeze({ local: normalizedLocal, canonical: normalizedCanonical });
}

export function isCanonicalRegistryReference(value) {
  return !!value
    && typeof value.registryId === "string"
    && value.registryId.trim().length > 0
    && typeof value.entityType === "string"
    && value.entityType.trim().length > 0;
}
