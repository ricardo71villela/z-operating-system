import type { JobOfferDraft, JobOfferStatus } from '../../../packages/domain/src/types/jobOffer';
import { PgStore } from './pgStore';
import type { JobOfferRecord } from './store';

/**
 * Thin forward-compatible adapter over PgStore for columns that already
 * exist in jobs.job_offers but were historically omitted by the application
 * mapper. Keeping this as a subclass avoids copying the large PgStore and
 * makes the boundary explicit until these fields become part of its base
 * mapper in a later cleanup.
 *
 * No schema authority lives here. PostgreSQL remains authoritative for the
 * columns; this class only makes them cross the application boundary.
 */
export class ExplicitRequirementsPgStore extends PgStore {
  private async enrichOffers(offers: JobOfferRecord[]): Promise<JobOfferRecord[]> {
    if (offers.length === 0) return offers;

    const ids = offers.map((offer) => offer.id);
    const { rows } = await this.query(
      `select id, responsibilities, required_qualifications, preferred_qualifications
       from job_offers
       where id = any($1::uuid[])`,
      [ids],
    );

    const byId = new Map(rows.map((row) => [row.id, row]));
    return offers.map((offer) => {
      const row = byId.get(offer.id);
      return {
        ...offer,
        responsibilities: row?.responsibilities ?? null,
        requiredQualifications: row?.required_qualifications ?? null,
        preferredQualifications: row?.preferred_qualifications ?? null,
      };
    });
  }

  private async enrichOffer(offer: JobOfferRecord): Promise<JobOfferRecord> {
    return (await this.enrichOffers([offer]))[0];
  }

  override async createJobOffer(
    draft: Omit<JobOfferDraft, 'status'>,
  ): Promise<JobOfferRecord> {
    const created = await super.createJobOffer(draft);

    await this.query(
      `update job_offers
       set responsibilities = $1,
           required_qualifications = $2,
           preferred_qualifications = $3
       where id = $4`,
      [
        draft.responsibilities ?? null,
        draft.requiredQualifications ?? null,
        draft.preferredQualifications ?? null,
        created.id,
      ],
    );

    return {
      ...created,
      responsibilities: draft.responsibilities ?? null,
      requiredQualifications: draft.requiredQualifications ?? null,
      preferredQualifications: draft.preferredQualifications ?? null,
    };
  }

  override async setJobOfferStatus(
    id: string,
    status: JobOfferStatus,
  ): Promise<JobOfferRecord> {
    return this.enrichOffer(await super.setJobOfferStatus(id, status));
  }

  override async listPublishedJobOffers(): Promise<JobOfferRecord[]> {
    return this.enrichOffers(await super.listPublishedJobOffers());
  }

  override async mustGetJobOffer(id: string): Promise<JobOfferRecord> {
    return this.enrichOffer(await super.mustGetJobOffer(id));
  }

  override async listReservedOffersForInstitution(
    institutionOrgId: string,
  ): Promise<JobOfferRecord[]> {
    return this.enrichOffers(await super.listReservedOffersForInstitution(institutionOrgId));
  }
}
