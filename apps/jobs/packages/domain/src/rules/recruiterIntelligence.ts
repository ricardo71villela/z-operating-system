import type { ApplicationStatus } from './application';

export interface ApplicationHistoryEntry {
  from: ApplicationStatus | null;
  to: ApplicationStatus;
  at: string;
}

export interface ApplicationPipelineInput {
  id: string;
  status: ApplicationStatus;
  createdAt: string;
  history: ApplicationHistoryEntry[];
}

export interface FunnelRates {
  acknowledged: number;
  interview: number;
  offer: number;
  hire: number;
}

export interface RecruiterIntelligence {
  totalApplications: number;
  stageCounts: Record<ApplicationStatus, number>;
  activeApplications: number;
  unacknowledgedApplications: number;
  rates: FunnelRates;
  medianHoursToFirstResponse: number | null;
  medianHoursToHire: number | null;
  historyCoverage: number;
  limitations: string[];
  usesProtectedCandidateAttributes: false;
}

const TERMINAL = new Set<ApplicationStatus>(['hired', 'rejected', 'withdrawn', 'closed']);

function seen(application: ApplicationPipelineInput, status: ApplicationStatus): boolean {
  return application.status === status || application.history.some((entry) => entry.to === status);
}

function percentage(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return Math.round(sorted[middle] * 10) / 10;
  return Math.round(((sorted[middle - 1] + sorted[middle]) / 2) * 10) / 10;
}

function hoursBetween(start: string, end: string): number | null {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return (endMs - startMs) / 3_600_000;
}

function firstMeaningfulResponse(application: ApplicationPipelineInput): string | null {
  const ordered = [...application.history]
    .filter((entry) => entry.to !== 'submitted')
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return ordered[0]?.at ?? null;
}

function hiredAt(application: ApplicationPipelineInput): string | null {
  const hired = application.history
    .filter((entry) => entry.to === 'hired')
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return hired[0]?.at ?? null;
}

export function buildRecruiterIntelligence(
  applications: ApplicationPipelineInput[],
): RecruiterIntelligence {
  const stageCounts = {
    submitted: 0,
    received: 0,
    screening: 0,
    shortlisted: 0,
    interview: 0,
    assessment: 0,
    offer: 0,
    hired: 0,
    rejected: 0,
    withdrawn: 0,
    closed: 0,
  } satisfies Record<ApplicationStatus, number>;

  for (const application of applications) stageCounts[application.status] += 1;

  const total = applications.length;
  const acknowledged = applications.filter((application) =>
    application.status !== 'submitted' || application.history.some((entry) => entry.to !== 'submitted'),
  ).length;
  const interviewed = applications.filter((application) => seen(application, 'interview')).length;
  const offered = applications.filter((application) => seen(application, 'offer')).length;
  const hired = applications.filter((application) => seen(application, 'hired')).length;

  const firstResponseHours = applications
    .map((application) => {
      const respondedAt = firstMeaningfulResponse(application);
      return respondedAt ? hoursBetween(application.createdAt, respondedAt) : null;
    })
    .filter((value): value is number => value !== null);

  const hireHours = applications
    .map((application) => {
      const timestamp = hiredAt(application);
      return timestamp ? hoursBetween(application.createdAt, timestamp) : null;
    })
    .filter((value): value is number => value !== null);

  const historyBacked = applications.filter((application) => application.history.length > 0).length;
  const historyCoverage = percentage(historyBacked, total);
  const limitations: string[] = [];
  if (total === 0) limitations.push('no_applications');
  if (total > 0 && historyCoverage < 100) limitations.push('incomplete_status_history');
  if (firstResponseHours.length === 0 && total > 0) limitations.push('no_first_response_timing_evidence');

  return {
    totalApplications: total,
    stageCounts,
    activeApplications: applications.filter((application) => !TERMINAL.has(application.status)).length,
    unacknowledgedApplications: applications.filter((application) => application.status === 'submitted').length,
    rates: {
      acknowledged: percentage(acknowledged, total),
      interview: percentage(interviewed, total),
      offer: percentage(offered, total),
      hire: percentage(hired, total),
    },
    medianHoursToFirstResponse: median(firstResponseHours),
    medianHoursToHire: median(hireHours),
    historyCoverage,
    limitations,
    usesProtectedCandidateAttributes: false,
  };
}
