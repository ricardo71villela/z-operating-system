// apps/api/src/jobAlerts.ts
//
// Daily job alert emails. For each alert due (one email a day at most), the
// offers published since the last email that match the saved search
// (keywords, pillar, country) are sent to the candidate in their language.
// Nothing is sent when nothing new matches; the window then keeps growing
// until something does.

import type { PgStore } from './pgStore';
import { EMAIL_TEMPLATES, type EmailLocale, type EmailService, type AlertEmailOffer } from './emailService';
import type { PublicOfferRecord } from './store';

export const ALERT_EMAIL_MAX_OFFERS = 10;

export interface JobAlertRunResult {
  processed: number;
  emailed: number;
  nothingNew: number;
  noContact: number;
  failed: number;
}

const PERIOD: Record<EmailLocale, Record<string, string>> = {
  fr: { hourly: '/ heure', daily: '/ jour', monthly: '/ mois', yearly: '/ an' },
  en: { hourly: '/ hour', daily: '/ day', monthly: '/ month', yearly: '/ year' },
};

function formatAmount(n: number, locale: EmailLocale) {
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 0 }).format(n);
}

export function offerForEmail(o: PublicOfferRecord, locale: EmailLocale, portalUrl: string): AlertEmailOffer {
  const range = formatAmount(o.salaryMin, locale) + (o.salaryMax ? ` – ${formatAmount(o.salaryMax, locale)}` : '');
  const money = locale === 'en' ? `€${range}` : `${range} €`;
  const city = o.location?.city ? `${o.location.city}${o.location.countryCode ? ` (${o.location.countryCode})` : ''}` : '';
  return {
    title: o.title,
    employer: o.employer?.displayName ?? '',
    salary: `${money} ${PERIOD[locale][o.salaryPeriod] ?? ''}`.trim(),
    place: city,
    url: `${portalUrl}/?offre=${encodeURIComponent(o.id)}&lang=${locale}`,
  };
}

export async function runJobAlerts(store: PgStore, email: EmailService, options: { portalUrl: string; now?: Date; limit?: number }): Promise<JobAlertRunResult> {
  const now = options.now ?? new Date();
  const portalUrl = options.portalUrl.replace(/\/+$/, '');
  const result: JobAlertRunResult = { processed: 0, emailed: 0, nothingNew: 0, noContact: 0, failed: 0 };
  const due = await store.listDueJobAlerts(options.limit ?? 100);

  for (const alert of due) {
    result.processed += 1;
    try {
      const params = alert.queryParams || {};
      const locale: EmailLocale = params.locale === 'en' ? 'en' : 'fr';
      const keywords = typeof params.keywords === 'string' ? params.keywords.trim() : '';
      const country = typeof params.country === 'string' && /^(FR|BE|LU)$/.test(params.country) ? params.country : undefined;
      const pillar = typeof params.pillar === 'string' ? params.pillar : undefined;
      const found = await store.searchPublishedJobOffers({ q: keywords, country, pillar, publishedSince: alert.since, limit: ALERT_EMAIL_MAX_OFFERS });
      if (found.total === 0) { result.nothingNew += 1; continue; }

      const contact = await store.getUserContact(alert.userId);
      if (!contact?.email) { result.noContact += 1; continue; }

      const label = keywords || (locale === 'en' ? 'all listings' : 'toutes les offres');
      const tpl = EMAIL_TEMPLATES.jobAlert(
        contact.fullName || (locale === 'en' ? 'there' : ''),
        label,
        found.offers.map((o) => offerForEmail(o, locale, portalUrl)),
        found.total,
        `${portalUrl}/?lang=${locale}`,
        locale,
      );
      const sent = await email.send({ to: contact.email, subject: tpl.subject, body: tpl.body, templateKey: 'jobAlert' });
      if (sent.sent || sent.provider === 'console') {
        await store.markJobAlertNotified(alert.alertId, now);
        result.emailed += 1;
      } else {
        result.failed += 1;
      }
    } catch (err) {
      console.error('[job-alerts] alert failed', alert.alertId, err);
      result.failed += 1;
    }
  }
  return result;
}
