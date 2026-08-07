import { supabaseAdmin } from "../supabase-admin";

export type StagingTransitionPatch = Record<string, unknown>;

export class StagingStateTransitionService {
  async transition(
    stagingRecordId: string,
    nextState: string,
    patch: StagingTransitionPatch = {},
    options: {
      reason?: string;
      actorType?: string;
      actorId?: string | null;
      correlationId?: string | null;
      metadata?: Record<string, unknown>;
    } = {},
  ): Promise<void> {
    const { data: current, error: readError } = await supabaseAdmin
      .from("automotive_staging_records")
      .select("status")
      .eq("id", stagingRecordId)
      .single();

    if (readError || !current) {
      throw new Error(
        `Unable to read staging state: ${readError?.message ?? "record not found"}`,
      );
    }

    const previousState = String(current.status);
    const { error: updateError } = await supabaseAdmin
      .from("automotive_staging_records")
      .update({ ...patch, status: nextState })
      .eq("id", stagingRecordId);

    if (updateError) {
      throw new Error(`Unable to transition staging record: ${updateError.message}`);
    }

    if (previousState === nextState) return;

    const { error: historyError } = await supabaseAdmin
      .from("automotive_state_history")
      .insert({
        subject_type: "automotive_staging_record",
        subject_id: stagingRecordId,
        state_machine: "automotive_staging",
        previous_state: previousState,
        next_state: nextState,
        actor_type: options.actorType ?? "system",
        actor_id: options.actorId ?? null,
        reason: options.reason ?? null,
        correlation_id: options.correlationId ?? null,
        metadata: options.metadata ?? {},
      });

    if (historyError) {
      throw new Error(`Staging state changed but history write failed: ${historyError.message}`);
    }
  }
}
