import type { ResolvedAutomotiveProjection } from "../../../packages/automotive-domain/src";

export interface ResolvedProjectionRepository {
  upsert(projection: ResolvedAutomotiveProjection): Promise<void>;
}
