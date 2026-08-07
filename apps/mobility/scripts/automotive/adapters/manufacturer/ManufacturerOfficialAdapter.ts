import { BaseAdapter } from "../../core/BaseAdapter";

import type {
  AdapterContext,
  ExternalAutomotiveRecord,
} from "../../core/types";

import type {
  ManufacturerAdapterConfig,
  ManufacturerOfficialRecord,
} from "../../core/manufacturer-types";

export abstract class ManufacturerOfficialAdapter
  extends BaseAdapter {
  abstract readonly config: ManufacturerAdapterConfig;

  protected abstract getOfficialRecords():
    | ManufacturerOfficialRecord[]
    | Promise<ManufacturerOfficialRecord[]>;

  get sourceCode(): string {
    return this.config.sourceCode;
  }

  get entityType() {
    return this.config.entityType;
  }

  async fetchRecords(
    _context: AdapterContext,
  ): Promise<ExternalAutomotiveRecord[]> {
    void _context;
    const records = await this.getOfficialRecords();

    return records.map((record) =>
      this.toExternalRecord(record),
    );
  }

  protected toExternalRecord(
    record: ManufacturerOfficialRecord,
  ): ExternalAutomotiveRecord {
    if (!record.externalId.trim()) {
      throw new Error(
        `Missing external ID for ${record.name}.`,
      );
    }

    if (!record.officialUrl.trim()) {
      throw new Error(
        `Missing official URL for ${record.name}.`,
      );
    }

    if (record.entityType !== this.entityType) {
      throw new Error(
        `Entity type mismatch for ${record.name}: expected ${this.entityType}, received ${record.entityType}.`,
      );
    }

    return {
      entityType: record.entityType,
      externalId: record.externalId,
      externalParentId:
        record.externalParentId ?? null,
      rawName: record.name,
      countryCode:
        record.countryCode ??
        this.config.countryCode,
      marketCode: record.marketCode ?? null,

      payload: {
        manufacturer:
          record.manufacturer ||
          this.config.manufacturerName,

        brand:
          record.brand ||
          this.config.brandName,

        model: record.model ?? null,
        generation: record.generation ?? null,
        variant: record.variant ?? null,
        body_style: record.bodyStyle ?? null,
        model_year: record.modelYear ?? null,

        official_url: record.officialUrl,
        official_document_type:
          record.documentType,

        source_is_official: true,
        publisher:
          record.manufacturer ||
          this.config.manufacturerName,

        legal_review_required:
          record.legalReviewRequired,

        automatic_publication_allowed:
          record.automaticPublicationAllowed,

        ...(record.technicalData ?? {}),

        metadata: record.metadata ?? {},
      },
    };
  }
}