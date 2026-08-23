import type { JobOfferDraft, JobOfferStatus } from '../../../packages/domain/src/types/jobOffer';
import { computeProfileCompleteness } from '../../../packages/domain/src/rules/candidateProfile';
import { buildCandidateIntelligence } from '../../../packages/domain/src/rules/candidateIntelligence';
import { buildEmployerIntelligence } from '../../../packages/domain/src/rules/employerIntelligence';
import { PgStore } from './pgStore';
import type { JobOfferRecord } from './store';

/**
 * Thin forward-compatible adapter over PgStore for product capabilities that
 * already have authoritative PostgreSQL/domain primitives but were historically
 * omitted by the application mapper.
 *
 * Current responsibilities:
 * - make the existing explicit Job Offer qualification columns cross the API
 *   boundary without duplicating PgStore;
 * - compose already-approved Candidate/Employer Intelligence into existing API
 *   responses, without creating a second persistence or scoring authority.
 *
 * No schema authority lives here. PostgreSQL remains authoritative for stored
 * data; domain modules remain authoritative for intelligence calculations.
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

  /**
   * The existing GET /candidates/:id/profile-bundle route spreads the Store
   * result into its JSON response. Adding candidateIntelligence here therefore
   * makes the approved domain capability immediately consumable without a new
   * HTTP route or a duplicated client-side calculation.
   */
  override async getCandidateProfileBundle(userId: string) {
    const bundle = await super.getCandidateProfileBundle(userId);
    const matchingProfile = await this.getCandidateMatchingProfile(userId);

    if (!matchingProfile) {
      return { ...bundle, candidateIntelligence: null };
    }

    const completeness = computeProfileCompleteness({
      hasProfessionalTitle: !!bundle.profile?.professionalTitle,
      hasSummary: !!bundle.profile?.summary,
      experienceCount: bundle.experiences.length,
      educationCount: bundle.education.length,
      skillCount: bundle.skills.length,
      languageCount: bundle.languages.length,
      hasResumeDocument: bundle.documents.some((document) => document.docType === 'cv'),
      hasVisibilitySet: !!bundle.profile?.visibility,
    });

    return {
      ...bundle,
      candidateIntelligence: buildCandidateIntelligence(completeness, matchingProfile),
    };
  }

  /**
   * GET /organizations/:id/responsibility already returns the metrics object
   * produced here. Attaching intelligence to those aggregate metrics exposes
   * the approved Employer Intelligence signals without changing the route,
   * without paid-placement influence and without exposing candidate records.
   */
  override async computeEmployerMetrics(orgId: string) {
    const metrics = await super.computeEmployerMetrics(orgId);
    return {
      ...metrics,
      intelligence: buildEmployerIntelligence(metrics),
    };
  }
}
