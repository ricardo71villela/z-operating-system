import type { ResolvedAutomotiveProjection } from "../../../../packages/automotive-domain/src";
import type { ResolvedProjectionRepository } from "../../ports/ResolvedProjectionRepository";
import { supabaseAdmin } from "../../supabase-admin";

export class SupabaseResolvedProjectionRepository
  implements ResolvedProjectionRepository
{
  async upsert(projection: ResolvedAutomotiveProjection): Promise<void> {
    const { error } = await supabaseAdmin
      .from("automotive_resolved_profiles")
      .upsert(
        {
          entity_id: projection.entityId,
          entity_type: projection.entityType,
          resolved_payload: projection.metrics,
          source_count: projection.sourceCount,
          observation_count: projection.observationCount,
          conflict_count: projection.conflictCount,
          policy_version: projection.policyVersion,
          resolved_at: projection.resolvedAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "entity_id,entity_type" },
      );

    if (error) {
      throw new Error(`Unable to save resolved automotive profile: ${error.message}`);
    }
  }
}
