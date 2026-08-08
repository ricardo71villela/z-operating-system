import type {
  AdapterContext,
  AutomotiveEntityType,
  ExternalAutomotiveRecord,
} from "./types";

export abstract class BaseAdapter {
  abstract readonly sourceCode: string;
  abstract readonly entityType: AutomotiveEntityType;

  abstract fetchRecords(
    context: AdapterContext,
  ): Promise<ExternalAutomotiveRecord[]>;

  protected requireExternalId(
    value: unknown,
    recordName: string,
  ): string {
    if (
      typeof value !== "string" &&
      typeof value !== "number"
    ) {
      throw new Error(
        `Missing external ID for ${recordName}.`,
      );
    }

    return String(value);
  }

  protected cleanString(value: unknown): string | null {
    if (typeof value !== "string") {
      return null;
    }

    const cleaned = value.trim();

    return cleaned.length > 0 ? cleaned : null;
  }
}