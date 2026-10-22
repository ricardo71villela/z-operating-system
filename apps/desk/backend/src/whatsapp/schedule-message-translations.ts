/**
 * Minimal translation table for the WhatsApp schedule-export message
 * (personnel.controller.ts exportScheduleWhatsapp). Deliberately NOT
 * shared with the frontend's src/messages/*.json — backend and frontend
 * are separate deployables (NestJS vs Next.js), so this is duplicated by
 * necessity, not oversight. If this grows beyond one message template,
 * revisit extracting a shared i18n package.
 *
 * Keyed by workspace_members.preferred_language. Z Desk launches in
 * French and English only (same scope as Z Find and Z Jobs); any other
 * stored value falls back to French.
 */

export const SUPPORTED_LANGUAGES = ['fr', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

interface ScheduleMessageStrings {
  dayNames: string[]; // índice 0 = domingo, igual a Date.getUTCDay()
  header: (weekStart: string) => string;
  absent: string;
  off: string;
}

const STRINGS: Record<SupportedLanguage, ScheduleMessageStrings> = {
  fr: {
    dayNames: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
    header: (weekStart) => `📅 Votre horaire — semaine du ${weekStart}`,
    absent: 'absence',
    off: 'repos',
  },
  en: {
    dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    header: (weekStart) => `📅 Your schedule — week of ${weekStart}`,
    absent: 'absence',
    off: 'off',
  },
};

export function getScheduleMessageStrings(language: string): ScheduleMessageStrings {
  return STRINGS[(language as SupportedLanguage)] ?? STRINGS.fr;
}
