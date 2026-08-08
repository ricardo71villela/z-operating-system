import type {
  PipelineStage,
} from "./PipelineStage";

export async function executeStage<TContext>(
  stage: PipelineStage<TContext>,
  context: TContext,
): Promise<void> {
  await stage.execute(context);
}