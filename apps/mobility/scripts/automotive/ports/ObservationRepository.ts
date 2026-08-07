import type { AutomotiveObservation } from "../../../packages/automotive-domain/src";

export interface ObservationRepository {
  upsertMany(observations: AutomotiveObservation[]): Promise<number>;
  listForEntity(entityId: string): Promise<AutomotiveObservation[]>;
}
