export type FranceHolidayRegion = 'national' | 'alsace-moselle';

export interface FrancePublicHoliday {
  date: string;
  code:
    | 'new_year'
    | 'easter_monday'
    | 'labour_day'
    | 'victory_1945'
    | 'ascension'
    | 'whit_monday'
    | 'national_day'
    | 'assumption'
    | 'all_saints'
    | 'armistice'
    | 'christmas'
    | 'good_friday'
    | 'saint_stephen';
  name: string;
}

const names = {
  pt: {
    new_year: 'Ano Novo', easter_monday: 'Segunda-feira de Páscoa', labour_day: 'Dia do Trabalhador', victory_1945: 'Vitória de 1945', ascension: 'Ascensão', whit_monday: 'Segunda-feira de Pentecostes', national_day: 'Festa Nacional de França', assumption: 'Assunção', all_saints: 'Todos os Santos', armistice: 'Armistício de 1918', christmas: 'Natal', good_friday: 'Sexta-feira Santa', saint_stephen: 'São Estêvão',
  },
  en: {
    new_year: "New Year's Day", easter_monday: 'Easter Monday', labour_day: 'Labour Day', victory_1945: 'Victory in Europe Day', ascension: 'Ascension Day', whit_monday: 'Whit Monday', national_day: 'French National Day', assumption: 'Assumption Day', all_saints: "All Saints' Day", armistice: 'Armistice Day', christmas: 'Christmas Day', good_friday: 'Good Friday', saint_stephen: "St Stephen's Day",
  },
  fr: {
    new_year: "Jour de l'An", easter_monday: 'Lundi de Pâques', labour_day: 'Fête du Travail', victory_1945: 'Victoire 1945', ascension: 'Ascension', whit_monday: 'Lundi de Pentecôte', national_day: 'Fête nationale', assumption: 'Assomption', all_saints: 'Toussaint', armistice: 'Armistice 1918', christmas: 'Noël', good_friday: 'Vendredi saint', saint_stephen: 'Saint-Étienne',
  },
  es: {
    new_year: 'Año Nuevo', easter_monday: 'Lunes de Pascua', labour_day: 'Día del Trabajo', victory_1945: 'Victoria de 1945', ascension: 'Ascensión', whit_monday: 'Lunes de Pentecostés', national_day: 'Fiesta Nacional de Francia', assumption: 'Asunción', all_saints: 'Todos los Santos', armistice: 'Armisticio de 1918', christmas: 'Navidad', good_friday: 'Viernes Santo', saint_stephen: 'San Esteban',
  },
  it: {
    new_year: 'Capodanno', easter_monday: "Lunedì dell'Angelo", labour_day: 'Festa del Lavoro', victory_1945: 'Vittoria del 1945', ascension: 'Ascensione', whit_monday: 'Lunedì di Pentecoste', national_day: 'Festa nazionale francese', assumption: 'Assunzione', all_saints: 'Ognissanti', armistice: 'Armistizio del 1918', christmas: 'Natale', good_friday: 'Venerdì Santo', saint_stephen: 'Santo Stefano',
  },
  de: {
    new_year: 'Neujahr', easter_monday: 'Ostermontag', labour_day: 'Tag der Arbeit', victory_1945: 'Sieg 1945', ascension: 'Christi Himmelfahrt', whit_monday: 'Pfingstmontag', national_day: 'Französischer Nationalfeiertag', assumption: 'Mariä Himmelfahrt', all_saints: 'Allerheiligen', armistice: 'Waffenstillstand 1918', christmas: 'Weihnachten', good_friday: 'Karfreitag', saint_stephen: 'Stephanstag',
  },
} as const;

type HolidayCode = FrancePublicHoliday['code'];
type SupportedLocale = keyof typeof names;

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utcDate(year, month - 1, day);
}

function holiday(code: HolidayCode, date: Date, locale: SupportedLocale): FrancePublicHoliday {
  return { code, date: iso(date), name: names[locale][code] };
}

export function getFrancePublicHolidays(year: number, localeInput: string, region: FranceHolidayRegion = 'national'): FrancePublicHoliday[] {
  const locale = (localeInput in names ? localeInput : 'fr') as SupportedLocale;
  const easter = easterSunday(year);
  const holidays: FrancePublicHoliday[] = [
    holiday('new_year', utcDate(year, 0, 1), locale),
    holiday('easter_monday', addDays(easter, 1), locale),
    holiday('labour_day', utcDate(year, 4, 1), locale),
    holiday('victory_1945', utcDate(year, 4, 8), locale),
    holiday('ascension', addDays(easter, 39), locale),
    holiday('whit_monday', addDays(easter, 50), locale),
    holiday('national_day', utcDate(year, 6, 14), locale),
    holiday('assumption', utcDate(year, 7, 15), locale),
    holiday('all_saints', utcDate(year, 10, 1), locale),
    holiday('armistice', utcDate(year, 10, 11), locale),
    holiday('christmas', utcDate(year, 11, 25), locale),
  ];

  if (region === 'alsace-moselle') {
    holidays.push(holiday('good_friday', addDays(easter, -2), locale));
    holidays.push(holiday('saint_stephen', utcDate(year, 11, 26), locale));
  }

  return holidays.sort((left, right) => left.date.localeCompare(right.date));
}
