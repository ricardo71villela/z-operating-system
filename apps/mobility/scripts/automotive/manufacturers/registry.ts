import type {
  ManufacturerAdapter,
  ManufacturerPipelineInput,
} from "./contracts";

export class ManufacturerRegistry {
  private readonly adapters =
    new Map<string, ManufacturerAdapter>();

  register(
    adapter: ManufacturerAdapter,
  ): void {
    const id = adapter.id.trim();

    if (id.length === 0) {
      throw new Error(
        "Manufacturer adapter id cannot be empty.",
      );
    }

    if (this.adapters.has(id)) {
      throw new Error(
        `Manufacturer adapter "${id}" is already registered.`,
      );
    }

    this.adapters.set(id, adapter);
  }

  has(
    adapterId: string,
  ): boolean {
    return this.adapters.has(
      adapterId.trim(),
    );
  }

  get(
    adapterId: string,
  ): ManufacturerAdapter {
    const normalizedId =
      adapterId.trim();

    const adapter =
      this.adapters.get(normalizedId);

    if (!adapter) {
      throw new Error(
        `Manufacturer adapter "${normalizedId}" is not registered.`,
      );
    }

    return adapter;
  }

  resolve(
    input: ManufacturerPipelineInput,
  ): ManufacturerAdapter {
    const explicitId =
      input.manufacturer.trim();

    if (
      explicitId.length > 0 &&
      this.adapters.has(explicitId)
    ) {
      return this.get(explicitId);
    }

    const matches =
      [...this.adapters.values()].filter(
        (adapter) =>
          adapter.canHandle(input),
      );

    if (matches.length === 0) {
      throw new Error(
        "No manufacturer adapter can handle the provided pipeline input.",
      );
    }

    if (matches.length > 1) {
      const ids = matches
        .map((adapter) => adapter.id)
        .sort()
        .join(", ");

      throw new Error(
        `Multiple manufacturer adapters can handle the provided pipeline input: ${ids}.`,
      );
    }

    return matches[0];
  }

  list(): ManufacturerAdapter[] {
    return [...this.adapters.values()]
      .sort(
        (first, second) =>
          first.id.localeCompare(
            second.id,
          ),
      );
  }
}