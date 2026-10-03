/* ============================================================
   Z FIND — REFERENCE MORTGAGE RATES (FR / BE / LU)

   The only place where Z Find states a market interest rate. Every
   figure comes from an official or recognised public source, with its
   observation month, its publication date and a hard expiry date.

   Rules (never show a wrong or outdated rate):
   - A rate is prefilled only while today <= staleAfter. After that date
     the simulators show NO rate: the visitor types the rate offered by
     their bank or broker. The page never falls back to an older figure.
   - Only durations that the source actually publishes get a reference;
     other durations have none.
   - A market with no recent official figure has `rates: null` (Belgium
     today: the latest National Bank of Belgium MIR figure found is for
     February 2026, too old to show).
   - The daily production monitor (tests/production/zfind-production-monitor.js)
     fails — and GitHub e-mails the owner — once a market is past its
     staleAfter date, so the figures get refreshed.

   HOW TO UPDATE (monthly):
     France     — Observatoire Crédit Logement / CSA, monthly dashboard
                  (average rates by duration, excluding insurance and
                  guarantee costs), published ~10 days after the month.
     Luxembourg — Banque centrale du Luxembourg, monthly "Taux d'intérêt"
                  press release (new housing loans to households, fixed
                  rate by initial fixation period), ~6-7 weeks after.
     Belgium    — National Bank of Belgium, MIR statistics (fill in when
                  a recent official figure is available).
   Set period (YYYY-MM observed), publishedAt (YYYY-MM or YYYY-MM-DD),
   and staleAfter = about two publication cycles after publication.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.creditRates = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const DATA = Object.freeze({
    checkedAt: '2026-10-03',
    markets: Object.freeze({
      FR: Object.freeze({
        period: '2026-08',
        publishedAt: '2026-09',
        staleAfter: '2026-11-15',
        source: Object.freeze({
          name: 'Observatoire Crédit Logement / CSA',
          url: 'https://lobservatoire.creditlogement.fr/wp-content/uploads/sites/2/2026/09/TDB_L_Observatoire_Credit_Logement_CSA_aout2026.pdf'
        }),
        measure: 'average_by_duration',
        rates: Object.freeze({ 15: 3.14, 20: 3.27, 25: 3.35 })
      }),
      BE: Object.freeze({
        period: null,
        publishedAt: null,
        staleAfter: null,
        source: Object.freeze({ name: 'Banque nationale de Belgique (statistiques MIR)', url: 'https://stat.nbb.be/' }),
        measure: null,
        rates: null
      }),
      LU: Object.freeze({
        period: '2026-07',
        publishedAt: '2026-09-16',
        staleAfter: '2026-11-15',
        source: Object.freeze({
          name: 'Banque centrale du Luxembourg (BCL)',
          url: 'https://www.bcl.lu/en/Media-and-News/Press-releases/2026/09/interest-rates/index.html'
        }),
        measure: 'average_by_fixation',
        // Fixed rate by initial fixation period: 15 = ">10 to 15 years",
        // 20 = ">15 to 20", 25 = ">20 to 25", 30 = ">25 to 30".
        rates: Object.freeze({ 15: 3.94, 20: 3.85, 25: 3.50, 30: 3.91 })
      })
    })
  });

  const DAY = 86400000;

  function dayStart(value) {
    const d = value instanceof Date ? value : new Date(value == null ? Date.now() : value);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  function isFresh(market, today) {
    const m = DATA.markets[market];
    if (!m || !m.rates || !m.staleAfter) return false;
    return dayStart(today) <= Date.parse(m.staleAfter + 'T00:00:00Z');
  }

  /* The reference rate for one market and loan duration, or null when
     there is none (no source, duration not published, or data expired). */
  function reference(market, years, today) {
    const m = DATA.markets[market];
    if (!m || !m.rates) return null;
    const rate = m.rates[Math.round(Number(years))];
    if (!(rate > 0)) return null;
    if (!isFresh(market, today)) return null;
    return Object.freeze({ market, years: Math.round(Number(years)), ratePct: rate, period: m.period, publishedAt: m.publishedAt, measure: m.measure, source: m.source });
  }

  /* Why a market has no reference for this duration (for the UI). */
  function missingReason(market, years, today) {
    const m = DATA.markets[market];
    if (!m || !m.rates) return 'no_source';
    if (!isFresh(market, today)) return 'expired';
    if (!(m.rates[Math.round(Number(years))] > 0)) return 'duration';
    return null;
  }

  /* One line per market for the monitor: fresh or expired, days left. */
  function status(today) {
    const t = dayStart(today);
    return Object.keys(DATA.markets).map(key => {
      const m = DATA.markets[key];
      if (!m.rates) return { market: key, hasRates: false, fresh: false, daysLeft: null };
      const limit = Date.parse(m.staleAfter + 'T00:00:00Z');
      return { market: key, hasRates: true, fresh: t <= limit, daysLeft: Math.floor((limit - t) / DAY), period: m.period, staleAfter: m.staleAfter };
    });
  }

  function periodLabel(period, lang) {
    if (!period) return '';
    const [y, mo] = period.split('-').map(Number);
    return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, mo - 1, 1)));
  }

  return Object.freeze({ DATA, reference, missingReason, isFresh, status, periodLabel });
});
