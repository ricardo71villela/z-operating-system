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
  pt: { week: 'Semana', month: 'Mês', year: 'Ano', today: 'Hoje', previous: 'Anterior', next: 'Seguinte', publicHoliday: 'Feriado', absence: 'Ausência', vacation: 'Férias', sick: 'Baixa', otherAbsence: 'Outra ausência', france: 'França', backendUnavailable: 'Eventos e férias da equipa aparecem quando a sessão Z Desk e o backend estiverem disponíveis.', more: 'mais' },
  en: { week: 'Week', month: 'Month', year: 'Year', today: 'Today', previous: 'Previous', next: 'Next', publicHoliday: 'Public holiday', absence: 'Absence', vacation: 'Vacation', sick: 'Sick leave', otherAbsence: 'Other absence', france: 'France', backendUnavailable: 'Events and team leave appear when the Z Desk session and backend are available.', more: 'more' },
  fr: { week: 'Semaine', month: 'Mois', year: 'Année', today: "Aujourd’hui", previous: 'Précédent', next: 'Suivant', publicHoliday: 'Jour férié', absence: 'Absence', vacation: 'Congés', sick: 'Arrêt maladie', otherAbsence: 'Autre absence', france: 'France', backendUnavailable: 'Les événements et congés de l’équipe apparaissent lorsque la session Z Desk et le backend sont disponibles.', more: 'de plus' },
  es: { week: 'Semana', month: 'Mes', year: 'Año', today: 'Hoy', previous: 'Anterior', next: 'Siguiente', publicHoliday: 'Festivo', absence: 'Ausencia', vacation: 'Vacaciones', sick: 'Baja médica', otherAbsence: 'Otra ausencia', france: 'Francia', backendUnavailable: 'Los eventos y las vacaciones del equipo aparecen cuando la sesión Z Desk y el backend están disponibles.', more: 'más' },
  it: { week: 'Settimana', month: 'Mese', year: 'Anno', today: 'Oggi', previous: 'Precedente', next: 'Successivo', publicHoliday: 'Festività', absence: 'Assenza', vacation: 'Ferie', sick: 'Malattia', otherAbsence: 'Altra assenza', france: 'Francia', backendUnavailable: 'Gli eventi e le ferie del team compaiono quando la sessione Z Desk e il backend sono disponibili.', more: 'altri' },
  de: { week: 'Woche', month: 'Monat', year: 'Jahr', today: 'Heute', previous: 'Zurück', next: 'Weiter', publicHoliday: 'Feiertag', absence: 'Abwesenheit', vacation: 'Urlaub', sick: 'Krankheit', otherAbsence: 'Andere Abwesenheit', france: 'Frankreich', backendUnavailable: 'Termine und Teamurlaub erscheinen, sobald Z Desk-Sitzung und Backend verfügbar sind.', more: 'weitere' },
};

export function getCalendarCopy(locale: string): CalendarCopy {
  return copy[locale] ?? copy.en;
}
