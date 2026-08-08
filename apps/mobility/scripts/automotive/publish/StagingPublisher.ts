import { StagingStateTransitionService } from "./StagingStateTransitionService";

export class StagingPublisher {
  private readonly transitions = new StagingStateTransitionService();

  async approve(
    stagingRecordId: string,
    notes?: string,
  ): Promise<void> {
    await this.transitions.transition(
      stagingRecordId,
      "approved",
      {
        reviewed_at: new Date().toISOString(),
        review_notes: notes ?? null,
      },
      {
        reason: notes ?? "Staging record approved.",
        actorType: "reviewer",
      },
    );
  }

  async markImported(
    stagingRecordId: string,
    entityType: string,
    entityId: string,
  ): Promise<void> {
    await this.transitions.transition(
      stagingRecordId,
      "imported",
      {
        matched_entity_type: entityType,
        canonical_entity_type:
          entityType === "variant" ? "version" : entityType,
        matched_entity_id: entityId,
        reviewed_at: new Date().toISOString(),
      },
      {
        reason: `Staging record linked to ${entityType} ${entityId}.`,
        actorType: "system",
      },
    );
  }
}
