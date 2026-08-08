// packages/domain/src/rules/moderation.ts
//
// Moderação de denúncias e auditoria. Uma denúncia confirmada por um
// administrador alimenta diretamente `confirmedComplaintsCount` no
// Employment Responsibility Index (secção 8) — é o único caminho pelo
// qual uma reclamação afeta o índice; nunca é editável manualmente.

export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';
export type ReportResolution = 'confirmed' | 'unfounded';

export interface ReportRecord {
  id: string;
  targetType: 'job_offer' | 'organization';
  targetId: string;
  reason: string;
  status: ReportStatus;
  resolution?: ReportResolution;
}

const REPORT_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  open: ['reviewing', 'dismissed'],
  reviewing: ['resolved', 'dismissed'],
  resolved: [],
  dismissed: [],
};

export function canTransitionReport(from: ReportStatus, to: ReportStatus): boolean {
  return REPORT_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface ResolveReportInput {
  report: ReportRecord;
  resolution: ReportResolution;
}

export interface ResolveReportResult {
  status: ReportStatus;
  resolution: ReportResolution;
  countsAsConfirmedComplaint: boolean;
  requiresOfferSuspension: boolean;
}

/**
 * Só uma denúncia com resolução 'confirmed' conta para o ERI e sugere
 * suspensão da oferta/organização. Uma denúncia infundada ('unfounded')
 * não deixa qualquer rasto negativo no empregador — não penaliza.
 */
export function resolveReport({ report, resolution }: ResolveReportInput): ResolveReportResult {
  const nextStatus: ReportStatus = 'resolved';
  if (!canTransitionReport(report.status, nextStatus) && report.status !== 'reviewing') {
    // Permite resolver diretamente a partir de 'open' também (revisão rápida),
    // mas nunca a partir de um estado já terminal.
    if (report.status === 'resolved' || report.status === 'dismissed') {
      throw new Error(`Denúncia já está num estado terminal: ${report.status}`);
    }
  }
  return {
    status: nextStatus,
    resolution,
    countsAsConfirmedComplaint: resolution === 'confirmed',
    requiresOfferSuspension: resolution === 'confirmed' && report.targetType === 'job_offer',
  };
}

/* ---------------- Audit log ---------------- */

export type AuditAction =
  | 'create' | 'update' | 'approve' | 'reject' | 'publish'
  | 'suspend' | 'verify' | 'resolve_report' | 'dismiss_report';

export interface AuditEntry {
  actorId: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  beforeState?: unknown;
  afterState?: unknown;
  createdAt: string;
}

export function createAuditEntry(
  actorId: string,
  entityType: string,
  entityId: string,
  action: AuditAction,
  beforeState?: unknown,
  afterState?: unknown,
): AuditEntry {
  return {
    actorId,
    entityType,
    entityId,
    action,
    beforeState,
    afterState,
    createdAt: new Date().toISOString(),
  };
}
