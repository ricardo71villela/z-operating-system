import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { deskApiFetch } from '@/lib/desk-api';
import { RequestsBoard, type MarketplaceRequest, type RequestsLabels } from './requests-board';

export const dynamic = 'force-dynamic';

async function getRequests(locale: string): Promise<MarketplaceRequest[] | null> {
  const response = await deskApiFetch('requests');
  if (response?.status === 403) redirect(`/${locale}/welcome`);
  if (!response?.ok) return null;
  return (await response.json()) as MarketplaceRequest[];
}

const KEYS = [
  'newTitle', 'doneTitle', 'noNew', 'noDone', 'contact', 'visit', 'zFind', 'new', 'contacted', 'closed',
  'markContacted', 'markClosed', 'reopen', 'saving', 'error', 'receivedAt', 'call', 'email', 'whatsapp',
  'viewListing', 'openVisits', 'sale', 'rent', 'replySubject', 'replyGreeting', 'whatsappText',
  'enableAlerts', 'alertsOn', 'alertsBlocked', 'alertTitle', 'alertBody',
] as const;

export default async function RequestsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Requests');
  const requests = await getRequests(locale);
  const labels = Object.fromEntries(KEYS.map((key) => [key, t(key)])) as RequestsLabels;

  return (
    <main id="desk-main" className="page requests-page">
      <h1>{t('title')}</h1>
      <p>{t('subtitle')}</p>
      {requests === null
        ? <p className="notice error">{t('unavailable')}</p>
        : <RequestsBoard locale={locale} labels={labels} initialRequests={requests} />}
    </main>
  );
}
