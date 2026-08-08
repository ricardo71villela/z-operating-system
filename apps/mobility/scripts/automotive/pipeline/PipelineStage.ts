export interface PipelineStage<TContext> {
  readonly id: string;
  readonly name: string;

  execute(
    context: TContext,
  ): Promise<void>;
}