export interface CalendarCopy {
  week: string;
  month: string;
  year: string;
  today: string;
  previous: string;
  next: string;
  publicHoliday: string;
  absence: string;
  vacation: string;
  sick: string;
  otherAbsence: string;
  france: string;
  backendUnavailable: string;
  more: string;
}

const copy: Record<string, CalendarCopy> = {
  en: { week: 'Week', month: 'Month', year: 'Year', today: 'Today', previous: 'Previous', next: 'Next', publicHoliday: 'Public holiday', absence: 'Absence', vacation: 'Vacation', sick: 'Sick leave', otherAbsence: 'Other absence', france: 'France', backendUnavailable: 'Events and team leave appear when the Z Desk session and backend are available.', more: 'more' },
  fr: { week: 'Semaine', month: 'Mois', year: 'Année', today: "Aujourd’hui", previous: 'Précédent', next: 'Suivant', publicHoliday: 'Jour férié', absence: 'Absence', vacation: 'Congés', sick: 'Arrêt maladie', otherAbsence: 'Autre absence', france: 'France', backendUnavailable: 'Les événements et congés de l’équipe apparaissent lorsque la session Z Desk et le backend sont disponibles.', more: 'de plus' },
};

export function getCalendarCopy(locale: string): CalendarCopy {
  return copy[locale] ?? copy.en;
}
