import type {
  AutomotiveEntityType,
  ReconciliationResult,
} from "../core/types";

import { supabaseAdmin } from "../supabase-admin";

type StagingRecord = {
  id: string;
  entity_type: AutomotiveEntityType;
  normalized_name: string | null;
};

const masterTableByEntity: Partial<
  Record<AutomotiveEntityType, string>
> = {
  manufacturer: "automotive_manufacturers",
  brand: "automotive_brands",
  model: "automotive_models",
  generation: "automotive_generations",
};

export class ReconciliationEngine {
  async reconcile(
    stagingRecord: StagingRecord,
  ): Promise<ReconciliationResult> {
    const table =
      masterTableByEntity[stagingRecord.entity_type];

    if (!table || !stagingRecord.normalized_name) {
      return {
        decision: "manual_review",
        candidateEntityType:
          stagingRecord.entity_type,
        candidateEntityId: null,
        matchMethod: null,
        matchScore: 0,
        notes:
          "Entity type is not yet supported or has no normalized name.",
      };
    }

    const { data, error } = await supabaseAdmin
      .from(table)
      .select("id, name")
      .ilike(
        "name",
        stagingRecord.normalized_name,
      )
      .limit(2);

    if (error) {
      throw new Error(
        `Unable to reconcile staging record: ${error.message}`,
      );
    }

    if (data?.length === 1) {
      return {
        decision: "match_existing",
        candidateEntityType:
          stagingRecord.entity_type,
        candidateEntityId: data[0].id,
        matchMethod: "exact_name",
        matchScore: 100,
      };
    }

    if (!data || data.length === 0) {
      return {
        decision: "create_new",
        candidateEntityType:
          stagingRecord.entity_type,
        candidateEntityId: null,
        matchMethod: null,
        matchScore: 0,
      };
    }

    return {
      decision: "manual_review",
      candidateEntityType:
        stagingRecord.entity_type,
      candidateEntityId: null,
      matchMethod: "exact_name",
      matchScore: 50,
      notes:
        "More than one possible master record was found.",
    };
  }
}