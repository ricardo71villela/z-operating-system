import type {
  AutomotiveObservation,
  ResolvedAutomotiveProjection,
  ResolvedMetric,
} from "../../../packages/automotive-domain/src";

export type ResolutionPolicy = {
  version: string;
  sourcePriority?: Record<string, number>;
};

const DEFAULT_POLICY: ResolutionPolicy = {
  version: "automotive-resolution-v1",
  sourcePriority: {
    homologation: 100,
    technical_specification: 95,
    price_list: 90,
    model_range: 85,
    brochure: 80,
    press_kit: 70,
    other: 50,
  },
};

function scoreObservation(
  observation: AutomotiveObservation,
  policy: ResolutionPolicy,
): number {
  const sourcePriority =
    policy.sourcePriority?.[observation.source.documentType ?? "other"] ?? 0;
  const confidence = observation.confidenceScore ?? 50;
  const validatedBonus = observation.status === "validated" ? 20 : 0;
  const timestamp = Date.parse(observation.validity.observedAt);
  const recency = Number.isFinite(timestamp) ? timestamp / 1e13 : 0;

  return sourcePriority * 100 + confidence + validatedBonus + recency;
}

function valueFingerprint(observation: AutomotiveObservation): string {
  return JSON.stringify([observation.value, observation.unit ?? null]);
}

export class ResolvedAutomotiveProjectionEngine {
  constructor(private readonly policy: ResolutionPolicy = DEFAULT_POLICY) {}

  resolve(observations: AutomotiveObservation[]): ResolvedAutomotiveProjection {
    if (observations.length === 0) {
      throw new Error("Cannot resolve an automotive projection without observations.");
    }

    const entityId = observations[0].entityId;
    const entityType = observations[0].entityType;

    if (
      observations.some(
        (observation) =>
          observation.entityId !== entityId || observation.entityType !== entityType,
      )
    ) {
      throw new Error("All observations in a resolved projection must target the same entity.");
    }

    const groups = new Map<string, AutomotiveObservation[]>();

    for (const observation of observations) {
      const group = groups.get(observation.metric) ?? [];
      group.push(observation);
      groups.set(observation.metric, group);
    }

    const metrics: Record<string, ResolvedMetric> = {};
    let conflictCount = 0;
    const uniqueSources = new Set<string>();

    for (const [metric, group] of groups) {
      const sorted = [...group].sort(
        (left, right) =>
          scoreObservation(right, this.policy) - scoreObservation(left, this.policy),
      );
      const selected = sorted[0];
      const fingerprints = new Set(group.map(valueFingerprint));

      if (fingerprints.size > 1) {
        conflictCount += 1;
      }

      for (const observation of group) {
        const sourceKey =
          observation.source.sourceId ??
          observation.source.sourceCode ??
          observation.source.documentUrl;
        if (sourceKey) uniqueSources.add(sourceKey);
      }

      metrics[metric] = {
        metric: selected.metric,
        selectedObservationId: selected.id ?? null,
        value: selected.value,
        unit: selected.unit ?? null,
        confidenceScore: selected.confidenceScore ?? null,
        sourceCount: new Set(
          group.map(
            (observation) =>
              observation.source.sourceId ??
              observation.source.sourceCode ??
              observation.source.documentUrl ??
              "unknown",
          ),
        ).size,
        alternativeObservationIds: sorted
          .slice(1)
          .map((observation) => observation.id)
          .filter((id): id is string => Boolean(id)),
      };
    }

    return {
      entityId,
      entityType,
      metrics,
      sourceCount: uniqueSources.size,
      observationCount: observations.length,
      conflictCount,
      resolvedAt: new Date().toISOString(),
      policyVersion: this.policy.version,
    };
  }
}
