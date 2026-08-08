import type {
  ManufacturerPipelineInput,
} from "../contracts";

export function createTestManufacturerInput(
  overrides: Partial<ManufacturerPipelineInput> = {},
): ManufacturerPipelineInput {
  return {
    manufacturer: "test",
    brand: "Test",

    brandSlug: "test",
    modelSlug: "test-model",
    modelName: "Test Model",

    generation: null,

    marketCode: "PT",
    modelYear: 2026,

    documentType:
      "technical_specification",

    dryRun: true,

    ...overrides,
  };
}