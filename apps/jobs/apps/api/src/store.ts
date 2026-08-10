// apps/api/src/store.ts
//
// Repositório EM MEMÓRIA. Substitui uma ligação Supabase/Postgres real,
// que não está disponível neste ambiente (sem rede, sem BD provisionada).
//
// Desenhado deliberadamente com uma interface (Store) que espelha as
// migrations do Sprint 0, para que a troca por um repositório Postgres
// real seja uma implementação alternativa da mesma interface, não uma
// reescrita da lógica de aplicação em server.ts.

import { randomUUID } from 'node:crypto';
import type { JobOfferDraft, JobOfferStatus, VerificationStatus } from '../../../packages/domain/src/types/jobOffer';
import type { ApplicationStatus } from '../../../packages/domain/src/rules/application';

export interface UserRecord {
  id: string;
  fullName: string;
  email: string;
}

export interface OrganizationRecord {
  id: string;
  type: 'employer' | 'university' | 'polytechnic' | 'vocational_school' | 'training_center' | 'recruitment_agency';
  legalName: string;
  displayName: string;
  createdBy: string;
  verificationStatus: VerificationStatus;
  verificationRequestedAt?: string;
}

export interface JobOfferRecord extends JobOfferDraft {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationRecord {
  id: string;
  jobOfferId: string;

  // null depois de um candidate-erasure: preservamos o facto histórico
  // da candidatura sem manter a ligação à identidade da pessoa.
  candidateId: string | null;

  status: ApplicationStatus;
  createdAt: string;
  history: { from: ApplicationStatus | null; to: ApplicationStatus; at: string }[];
}

export interface CandidateProfileRecord {
  userId: string;
  professionalTitle: string;
  summary: string;
  visibility: 'private' | 'applications_only' | 'visible_to_verified_employers' | 'public';
  isOpenToOffers?: boolean;
  availability?: 'immediate' | 'in_30_days' | 'in_90_days' | 'not_looking' | null;
  desiredWorkRegime?: 'on_site' | 'hybrid' | 'remote' | null;
  desiredContractTypes?: string[];
  desiredSalaryMin?: number | null;
  desiredSalaryMax?: number | null;
  desiredSalaryCurrency?: string | null;
  interestedInFirstJob?: boolean;
  interestedInSeniorRoles?: boolean;
  interestedInInterim?: boolean;
  locationId?: string | null;
  isInternationallyMobile?: boolean;
}

export interface ExperienceRecord {
  id: string;
  userId: string;
  companyName: string;
  title: string;
  startDate: string;
  endDate?: string | null;
  isCurrent: boolean;
  description?: string;
}

export interface EducationRecord {
  id: string;
  userId: string;
  institutionName: string;
  degree?: string;
  fieldOfStudy?: string;
}

export interface DocumentRecord {
  id: string;
  userId: string;
  docType: 'cv' | 'certificate' | 'portfolio' | 'cover_letter';
  fileName: string;
}

export interface ReportRecordFull {
  id: string;
  targetType: 'job_offer' | 'organization';
  targetId: string;
  reason: string;
  reportedBy: string;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  resolution?: 'confirmed' | 'unfounded';
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  createdAt: string;
}

export interface CourseRecord {
  id: string;
  organizationId: string;
  name: string;
  fieldOfStudy?: string;
}

export interface ReservationRecord {
  id: string;
  jobOfferId: string;
  institutionOrgId: string;
}

export interface TranslationRecord {
  entityType: string;
  entityId: string;
  field: string;
  locale: string;
  value: string;
}

class InMemoryStore {
  users = new Map<string, UserRecord>();
  organizations = new Map<string, OrganizationRecord>();
  candidateProfiles = new Map<string, CandidateProfileRecord>();
  jobOffers = new Map<string, JobOfferRecord>();
  applications = new Map<string, ApplicationRecord>();
  experiences = new Map<string, ExperienceRecord>();
  education = new Map<string, EducationRecord>();
  skills = new Map<string, string[]>(); // userId -> skill names
  languages = new Map<string, string[]>(); // userId -> language codes
  documents = new Map<string, DocumentRecord>();
  reports = new Map<string, ReportRecordFull>();
  auditLogs: AuditLogRecord[] = [];
  courses = new Map<string, CourseRecord>();
  reservations = new Map<string, ReservationRecord>();
  translations: TranslationRecord[] = [];

  createUser(fullName: string, email: string): UserRecord {
    const user: UserRecord = { id: randomUUID(), fullName, email };
    this.users.set(user.id, user);
    return user;
  }

  createOrganization(legalName: string, displayName: string, createdBy: string, type: OrganizationRecord['type'] = 'employer'): OrganizationRecord {
    const org: OrganizationRecord = {
      id: randomUUID(),
      type,
      legalName,
      displayName,
      createdBy,
      verificationStatus: 'unverified',
    };
    this.organizations.set(org.id, org);
    return org;
  }

  requestVerification(orgId: string): OrganizationRecord {
    const org = this.mustGetOrg(orgId);
    org.verificationStatus = 'pending';
    org.verificationRequestedAt = new Date().toISOString();
    return org;
  }

  approveVerification(orgId: string): OrganizationRecord {
    const org = this.mustGetOrg(orgId);
    org.verificationStatus = 'verified';
    return org;
  }

  upsertCandidateProfile(rec: CandidateProfileRecord): CandidateProfileRecord {
    this.candidateProfiles.set(rec.userId, rec);
    return rec;
  }

  addExperience(rec: Omit<ExperienceRecord, 'id'>): ExperienceRecord {
    const full: ExperienceRecord = { ...rec, id: randomUUID() };
    this.experiences.set(full.id, full);
    return full;
  }

  addEducation(rec: Omit<EducationRecord, 'id'>): EducationRecord {
    const full: EducationRecord = { ...rec, id: randomUUID() };
    this.education.set(full.id, full);
    return full;
  }

  addSkill(userId: string, skillName: string) {
    const list = this.skills.get(userId) ?? [];
    if (!list.includes(skillName)) list.push(skillName);
    this.skills.set(userId, list);
    return list;
  }

  addLanguage(userId: string, languageCode: string) {
    const list = this.languages.get(userId) ?? [];
    if (!list.includes(languageCode)) list.push(languageCode);
    this.languages.set(userId, list);
    return list;
  }

  addDocument(rec: Omit<DocumentRecord, 'id'>): DocumentRecord {
    const full: DocumentRecord = { ...rec, id: randomUUID() };
    this.documents.set(full.id, full);
    return full;
  }

  createReport(rec: Omit<ReportRecordFull, 'id' | 'status' | 'createdAt'>): ReportRecordFull {
    const full: ReportRecordFull = { ...rec, id: randomUUID(), status: 'open', createdAt: new Date().toISOString() };
    this.reports.set(full.id, full);
    return full;
  }

  resolveReport(reportId: string, resolution: 'confirmed' | 'unfounded'): ReportRecordFull {
    const report = this.reports.get(reportId);
    if (!report) throw new NotFoundError(`report ${reportId} not found`);
    if (report.status === 'resolved' || report.status === 'dismissed') {
      throw new Error(`Denúncia já está num estado terminal: ${report.status}`);
    }
    report.status = 'resolved';
    report.resolution = resolution;

    if (resolution === 'confirmed' && report.targetType === 'job_offer') {
      const offer = this.jobOffers.get(report.targetId);
      if (offer) offer.status = 'suspended';
    }
    return report;
  }

  getReport(reportId: string): ReportRecordFull | undefined {
    return this.reports.get(reportId);
  }

  listReports(): ReportRecordFull[] {
    return [...this.reports.values()];
  }

  listAuditLogs(): AuditLogRecord[] {
    return this.auditLogs;
  }

  listApplicationsForOffer(jobOfferId: string): ApplicationRecord[] {
    return [...this.applications.values()].filter((a) => a.jobOfferId === jobOfferId);
  }

  addAuditLog(actorId: string, entityType: string, entityId: string, action: string): AuditLogRecord {
    const entry: AuditLogRecord = { id: randomUUID(), actorId, entityType, entityId, action, createdAt: new Date().toISOString() };
    this.auditLogs.push(entry);
    return entry;
  }

  setTranslation(entityType: string, entityId: string, field: string, locale: string, value: string): TranslationRecord {
    const existing = this.translations.find(
      (t) => t.entityType === entityType && t.entityId === entityId && t.field === field && t.locale === locale,
    );
    if (existing) {
      existing.value = value;
      return existing;
    }
    const rec: TranslationRecord = { entityType, entityId, field, locale, value };
    this.translations.push(rec);
    return rec;
  }

  getTranslationsFor(entityType: string, entityId: string): TranslationRecord[] {
    return this.translations.filter((t) => t.entityType === entityType && t.entityId === entityId);
  }

  addCourse(rec: Omit<CourseRecord, 'id'>): CourseRecord {
    const full: CourseRecord = { ...rec, id: randomUUID() };
    this.courses.set(full.id, full);
    return full;
  }

  reserveOfferForInstitution(jobOfferId: string, institutionOrgId: string): ReservationRecord {
    const full: ReservationRecord = { id: randomUUID(), jobOfferId, institutionOrgId };
    this.reservations.set(full.id, full);
    return full;
  }

  listReservedOffersForInstitution(institutionOrgId: string): JobOfferRecord[] {
    const offerIds = [...this.reservations.values()]
      .filter((r) => r.institutionOrgId === institutionOrgId)
      .map((r) => r.jobOfferId);
    return offerIds.map((id) => this.jobOffers.get(id)).filter((o): o is JobOfferRecord => !!o);
  }

  confirmedComplaintsForOrg(orgId: string): number {
    const orgOfferIds = new Set([...this.jobOffers.values()].filter((o) => o.organizationId === orgId).map((o) => o.id));
    return [...this.reports.values()].filter(
      (r) => r.resolution === 'confirmed' && (
        (r.targetType === 'organization' && r.targetId === orgId) ||
        (r.targetType === 'job_offer' && orgOfferIds.has(r.targetId))
      ),
    ).length;
  }


  /**
   * Compatibility with PgStore for routes that ask the shared store whether
   * the current actor is platform staff. The in-memory development store has
   * no persisted platform-role model, so it safely defaults to false.
   */
  async isPlatformStaff(_userId: string): Promise<boolean> {
    return false;
  }

  getCandidateProfileBundle(userId: string) {
    return {
      profile: this.candidateProfiles.get(userId) ?? null,
      experiences: [...this.experiences.values()].filter((e) => e.userId === userId),
      education: [...this.education.values()].filter((e) => e.userId === userId),
      skills: this.skills.get(userId) ?? [],
      languages: this.languages.get(userId) ?? [],
      documents: [...this.documents.values()].filter((d) => d.userId === userId),
    };
  }

  createJobOffer(draft: Omit<JobOfferDraft, 'status'>): JobOfferRecord {
    const now = new Date().toISOString();
    const rec: JobOfferRecord = {
      ...draft,
      status: 'draft',
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.jobOffers.set(rec.id, rec);
    return rec;
  }

  setJobOfferStatus(id: string, status: JobOfferStatus): JobOfferRecord {
    const offer = this.mustGetJobOffer(id);
    offer.status = status;
    offer.updatedAt = new Date().toISOString();
    return offer;
  }

  listPublishedJobOffers(): JobOfferRecord[] {
    return [...this.jobOffers.values()].filter((o) => o.status === 'published');
  }

  createApplication(jobOfferId: string, candidateId: string): ApplicationRecord {
    const now = new Date().toISOString();
    const rec: ApplicationRecord = {
      id: randomUUID(),
      jobOfferId,
      candidateId,
      status: 'submitted',
      createdAt: now,
      history: [{ from: null, to: 'submitted', at: now }],
    };
    this.applications.set(rec.id, rec);
    return rec;
  }

  transitionApplication(id: string, to: ApplicationStatus): ApplicationRecord {
    const app = this.mustGetApplication(id);
    app.history.push({ from: app.status, to, at: new Date().toISOString() });
    app.status = to;
    return app;
  }

  computeEmployerMetrics(orgId: string) {
    const org = this.mustGetOrg(orgId);
    const orgOffers = [...this.jobOffers.values()].filter((o) => o.organizationId === orgId);
    const published = orgOffers.filter((o) => o.status === 'published' || o.status === 'filled' || o.status === 'expired');

    const offersWithFixedSalaryCount = published.filter((o) => o.hasFixedSalary).length;
    const offersWithCompleteFieldsCount = published.filter(
      (o) => o.title && o.description && o.salaryMin && o.salaryCurrency,
    ).length;

    const orgOfferIds = new Set(orgOffers.map((o) => o.id));
    const orgApplications = [...this.applications.values()].filter((a) => orgOfferIds.has(a.jobOfferId));
    const respondedApplications = orgApplications.filter((a) => a.status !== 'submitted');
    const informedApplications = orgApplications.filter((a) =>
      ['hired', 'rejected', 'withdrawn', 'closed'].includes(a.status),
    );

    const hiredApplications = orgApplications.filter((a) => a.status === 'hired');
    const firstJobHiresCount = hiredApplications.filter((a) => {
      const offer = this.jobOffers.get(a.jobOfferId);
      return offer?.pillar === 'first_jobs';
    }).length;
    const seniorHiresCount = hiredApplications.filter((a) => {
      const offer = this.jobOffers.get(a.jobOfferId);
      return offer?.pillar === 'senior_careers';
    }).length;

    return {
      verificationStatus: org.verificationStatus,
      publishedOffersCount: published.length,
      offersWithFixedSalaryCount,
      offersWithCompleteFieldsCount,
      responseRate: orgApplications.length === 0 ? 0 : respondedApplications.length / orgApplications.length,
      candidatesInformedRate: orgApplications.length === 0 ? 0 : informedApplications.length / orgApplications.length,
      confirmedComplaintsCount: this.confirmedComplaintsForOrg(orgId),
      offerVsRealityDivergenceCount: 0,
      firstJobHiresCount,
      seniorHiresCount,
    };
  }

  mustGetOrg(id: string): OrganizationRecord {
    const org = this.organizations.get(id);
    if (!org) throw new NotFoundError(`organization ${id} not found`);
    return org;
  }

  mustGetJobOffer(id: string): JobOfferRecord {
    const offer = this.jobOffers.get(id);
    if (!offer) throw new NotFoundError(`job offer ${id} not found`);
    return offer;
  }

  mustGetApplication(id: string): ApplicationRecord {
    const app = this.applications.get(id);
    if (!app) throw new NotFoundError(`application ${id} not found`);
    return app;
  }
}

export class NotFoundError extends Error {}

export const store = new InMemoryStore();
