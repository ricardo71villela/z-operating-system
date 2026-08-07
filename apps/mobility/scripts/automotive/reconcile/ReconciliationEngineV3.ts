import { slugify } from "../config";
import type { AutomotiveRegistryRepository } from "../ports/AutomotiveRegistryRepository";
import { SupabaseAutomotiveRegistryRepository } from "../infrastructure/supabase/SupabaseAutomotiveRegistryRepository";
import { supabaseAdmin } from "../supabase-admin";
import { StagingStateTransitionService } from "../publish/StagingStateTransitionService";

export type VersionIdentityCandidate = {
  brand: string;
  model: string;
  generation: string;
  version: string;
  marketCode: string;
};

export type VersionReconciliationResult = {
  canonicalEntityType: "version";
  legacyEntityType: "variant";
  decision: "match_existing" | "create_new" | "manual_review" | "reject";
  candidateEntityId: string | null;
  matchMethod: "exact_slug" | "parent_and_name" | "fuzzy" | null;
  matchScore: number;
  notes: string;
};

type StagingRow = {
  id: string;
  source_id: string;
  raw_name: string | null;
  market_code: string | null;
  normalized_payload: Record<string, unknown> | null;
  raw_payload: Record<string, unknown> | null;
};

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

import { normalizeVersionName, versionSimilarityScore } from "./version-matching";

export class ReconciliationEngineV3 {
  private readonly transitions = new StagingStateTransitionService();
  constructor(
    private readonly registry: AutomotiveRegistryRepository =
      new SupabaseAutomotiveRegistryRepository(),
  ) {}

  async reconcileCandidate(
    candidate: VersionIdentityCandidate,
  ): Promise<VersionReconciliationResult> {
    const brand = await this.registry.findBrandBySlug(slugify(candidate.brand));
    if (!brand) return this.review(`Brand not found: ${candidate.brand}`, 20);

    const model = await this.registry.findModelBySlug(
      brand.id,
      slugify(candidate.model),
    );
    if (!model) return this.review(`Model not found: ${brand.name} ${candidate.model}`, 30);

    const generation = await this.registry.findGenerationBySlug(
      model.id,
      slugify(candidate.generation),
    );
    if (!generation) {
      return this.review(
        `Generation not found: ${brand.name} ${model.name} ${candidate.generation}`,
        40,
      );
    }

    const versions = await this.registry.listVersions(
      generation.id,
      candidate.marketCode,
    );

    if (versions.length === 0) {
      return this.result("create_new", null, "parent_and_name", 90, "Hierarchy matched and no versions exist.");
    }

    const incoming = normalizeVersionName(candidate.version, brand.name, model.name);
    const exactSlug = slugify(incoming);
    const exact = versions.find(
      (version) =>
        slugify(normalizeVersionName(version.name, brand.name, model.name)) ===
        exactSlug,
    );

    if (exact) {
      return this.result("match_existing", exact.id, "exact_slug", 100, "Exact normalized version match.");
    }

    const best = versions
      .map((version) => ({
        version,
        score: versionSimilarityScore(
          incoming,
          normalizeVersionName(version.name, brand.name, model.name),
        ),
      }))
      .sort((left, right) => right.score - left.score)[0];

    if (best && best.score >= 85) {
      return this.result(
        "match_existing",
        best.version.id,
        "fuzzy",
        best.score,
        `High-confidence version match with "${best.version.name}".`,
      );
    }

    if (best && best.score >= 55) {
      return this.result(
        "manual_review",
        best.version.id,
        "fuzzy",
        best.score,
        `Possible version match with "${best.version.name}".`,
      );
    }

    return this.result(
      "create_new",
      null,
      "parent_and_name",
      90,
      "Hierarchy matched but no similar version exists.",
    );
  }

  async reconcilePendingManufacturerVersions(sourceCodes: string[]) {
    const { data: sources, error: sourceError } = await supabaseAdmin
      .from("automotive_data_sources")
      .select("id, code")
      .in("code", sourceCodes);
    if (sourceError) throw new Error(sourceError.message);

    const sourceIds = (sources ?? []).map((source) => String(source.id));
    const found = new Set((sources ?? []).map((source) => String(source.code)));
    const missing = sourceCodes.filter((code) => !found.has(code));
    if (missing.length) throw new Error(`Missing data sources: ${missing.join(", ")}`);

    const { data, error } = await supabaseAdmin
      .from("automotive_staging_records")
      .select("id, source_id, raw_name, market_code, normalized_payload, raw_payload")
      .in("source_id", sourceIds)
      .eq("entity_type", "variant")
      .in("status", ["normalized", "matched", "new_candidate", "conflict"]);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as StagingRow[];
    const summary = { processed: rows.length, matched: 0, newCandidates: 0, manualReview: 0, rejected: 0 };

    for (const row of rows) {
      const payload = row.normalized_payload ?? row.raw_payload ?? {};
      const brand = readString(payload, "brand");
      const model = readString(payload, "model");
      const generation = readString(payload, "generation");
      const version = readString(payload, "variant") ?? row.raw_name;

      let result: VersionReconciliationResult;
      if (!brand || !model || !generation || !version) {
        result = this.result(
          "reject",
          null,
          null,
          0,
          "Missing brand, model, generation or version name.",
        );
      } else {
        result = await this.reconcileCandidate({
          brand,
          model,
          generation,
          version,
          marketCode: row.market_code ?? "EU",
        });
      }

      await this.saveCompatibilityResult(row.id, result);
      if (result.decision === "match_existing") summary.matched += 1;
      else if (result.decision === "create_new") summary.newCandidates += 1;
      else if (result.decision === "manual_review") summary.manualReview += 1;
      else summary.rejected += 1;
    }

    return summary;
  }

  private async saveCompatibilityResult(
    stagingRecordId: string,
    result: VersionReconciliationResult,
  ) {
    const status =
      result.decision === "match_existing"
        ? "matched"
        : result.decision === "create_new"
          ? "new_candidate"
          : result.decision === "reject"
            ? "rejected"
            : "conflict";

    await this.transitions.transition(
      stagingRecordId,
      status,
      {
        confidence_score: result.matchScore,
        matched_entity_type: result.candidateEntityId ? "variant" : null,
        canonical_entity_type: result.candidateEntityId ? "version" : null,
        matched_entity_id: result.candidateEntityId,
        review_notes: result.notes,
      },
      {
        reason: result.notes,
        actorType: "reconciliation_engine_v3",
        metadata: { decision: result.decision, matchMethod: result.matchMethod },
      },
    );

    await supabaseAdmin
      .from("automotive_reconciliation_queue")
      .delete()
      .eq("staging_record_id", stagingRecordId);

    const { error: queueError } = await supabaseAdmin
      .from("automotive_reconciliation_queue")
      .insert({
        staging_record_id: stagingRecordId,
        candidate_entity_type: "variant",
        canonical_entity_type: "version",
        candidate_entity_id: result.candidateEntityId,
        match_method: result.matchMethod,
        match_score: result.matchScore,
        decision: result.decision,
        decision_notes: result.notes,
        resolved_at:
          result.decision === "match_existing" ? new Date().toISOString() : null,
      });
    if (queueError) throw new Error(queueError.message);
  }

  private review(notes: string, score: number): VersionReconciliationResult {
    return this.result("manual_review", null, null, score, notes);
  }

  private result(
    decision: VersionReconciliationResult["decision"],
    candidateEntityId: string | null,
    matchMethod: VersionReconciliationResult["matchMethod"],
    matchScore: number,
    notes: string,
  ): VersionReconciliationResult {
    return {
      canonicalEntityType: "version",
      legacyEntityType: "variant",
      decision,
      candidateEntityId,
      matchMethod,
      matchScore,
      notes,
    };
  }
}
