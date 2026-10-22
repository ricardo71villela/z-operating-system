// packages/domain/src/rules/responseDeadline.ts
//
// No ghosting: every application gets a first answer from the employer
// within RESPONSE_DEADLINE_DAYS calendar days of being submitted.
//
// "A first answer" is the first move out of the waiting states
// (submitted, received): screening or any later stage, or a rejection.
// A candidate who withdraws before an answer stops the clock; nothing is
// owed to them. The rule is deliberately simple and checkable by both
// sides from the application's own history — no hidden scoring.

import type { ApplicationStatus } from './application';

export const RESPONSE_DEADLINE_DAYS = 14;
/** Shown as "due soon" from this many days before the deadline. */
export const RESPONSE_DUE_SOON_DAYS = 3;

const WAITING: ApplicationStatus[] = ['submitted', 'received'];
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ApplicationTimeline {
  createdAt: string;
  status: ApplicationStatus;
  history: { from: ApplicationStatus | null; to: ApplicationStatus; at: string }[];
}

export type ResponseState = 'waiting' | 'due_soon' | 'overdue' | 'answered' | 'answered_late' | 'withdrawn';

export interface ResponseDeadline {
  state: ResponseState;
  /** ISO date-time by which the first answer is due. */
  dueAt: string;
  /** When the first answer came, if it did. */
  answeredAt: string | null;
  /** Whole days left before the deadline (0 on the last day); negative when overdue. */
  daysLeft: number;
}

export function applicationResponseDeadline(app: ApplicationTimeline, now: Date = new Date()): ResponseDeadline {
  const created = new Date(app.createdAt);
  const due = new Date(created.getTime() + RESPONSE_DEADLINE_DAYS * DAY_MS);
  const ordered = [...app.history].sort((a, b) => a.at.localeCompare(b.at));
  const firstMove = ordered.find((h) => !WAITING.includes(h.to));
  const daysLeft = Math.floor((due.getTime() - now.getTime()) / DAY_MS);
  const base = { dueAt: due.toISOString(), daysLeft };

  if (firstMove && firstMove.to === 'withdrawn') return { ...base, state: 'withdrawn', answeredAt: null };
  if (firstMove) {
    const late = new Date(firstMove.at).getTime() > due.getTime();
    return { ...base, state: late ? 'answered_late' : 'answered', answeredAt: firstMove.at };
  }
  if (now.getTime() > due.getTime()) return { ...base, state: 'overdue', answeredAt: null };
  if (daysLeft < RESPONSE_DUE_SOON_DAYS) return { ...base, state: 'due_soon', answeredAt: null };
  return { ...base, state: 'waiting', answeredAt: null };
}

/** Applications still waiting for a first answer after the deadline. */
export function isAwaitingAnswerPastDeadline(app: ApplicationTimeline, now: Date = new Date()): boolean {
  return applicationResponseDeadline(app, now).state === 'overdue';
}
