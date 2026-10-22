import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { deskApiFetch } from '@/lib/desk-api';
import { VisitsBoard, type VisitRequest } from './visits-board';

export const dynamic = 'force-dynamic';

async function getVisits(locale: string): Promise<VisitRequest[] | null> {
  const response = await deskApiFetch('visits');
  if (response?.status === 403) redirect(`/${locale}/welcome`);
  if (!response?.ok) return null;
  return (await response.json()) as VisitRequest[];
}

export default async function VisitsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Visits');
  const visits = await getVisits(locale);

  const labels = {
    requested: t('requested'), confirmed: t('confirmed'), declined: t('declined'), cancelled: t('cancelled'),
    pendingTitle: t('pendingTitle'), historyTitle: t('historyTitle'), noPending: t('noPending'), noHistory: t('noHistory'),
    proposedSlots: t('proposedSlots'), confirmSlot: t('confirmSlot'), confirming: t('confirming'),
    decline: t('decline'), declining: t('declining'), declineReason: t('declineReason'), declineReasonHint: t('declineReasonHint'),
    cancel: t('cancel'), buyerNotified: t('buyerNotified'), buyerNotNotified: t('buyerNotNotified'),
    receivedAt: t('receivedAt'), visitOn: t('visitOn'), error: t('error'), conflict: t('conflict'),
    sale: t('sale'), rent: t('rent'), callBuyer: t('callBuyer'), emailBuyer: t('emailBuyer'), language: t('language'),
  };

  return (
    <main id="desk-main" className="page visits-page">
      <h1>{t('title')}</h1>
      <p>{t('subtitle')}</p>
      {visits === null
        ? <p className="notice error">{t('unavailable')}</p>
        : <VisitsBoard locale={locale} labels={labels} initialVisits={visits} />}
    </main>
  );
}
