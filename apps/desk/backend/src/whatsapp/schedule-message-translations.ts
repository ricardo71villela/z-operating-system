/**
 * Minimal translation table for the WhatsApp schedule-export message
 * (personnel.controller.ts exportScheduleWhatsapp). Deliberately NOT
 * shared with the frontend's src/messages/*.json — backend and frontend
 * are separate deployables (NestJS vs Next.js), so this is duplicated by
 * necessity, not oversight. If this grows beyond one message template,
 * revisit extracting a shared i18n package.
 *
 * Keyed by desk_users.preferred_language — independent of the tenant's
 * market/locale, per Ricardo: "operar em 6 idiomas independente do
 * mercado local".
 */

export const SUPPORTED_LANGUAGES = ['fr', 'en', 'es', 'pt', 'it', 'de'] as const;
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
  es: {
    dayNames: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
    header: (weekStart) => `📅 Su horario — semana del ${weekStart}`,
    absent: 'ausencia',
    off: 'descanso',
  },
  pt: {
    dayNames: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
    header: (weekStart) => `📅 O seu horário — semana de ${weekStart}`,
    absent: 'ausência',
    off: 'folga',
  },
  it: {
    dayNames: ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'],
    header: (weekStart) => `📅 Il suo orario — settimana del ${weekStart}`,
    absent: 'assenza',
    off: 'riposo',
  },
  de: {
    dayNames: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
    header: (weekStart) => `📅 Ihr Dienstplan — Woche vom ${weekStart}`,
    absent: 'Abwesenheit',
    off: 'frei',
  },
};

export function getScheduleMessageStrings(language: string): ScheduleMessageStrings {
  return STRINGS[(language as SupportedLanguage)] ?? STRINGS.fr;
}
