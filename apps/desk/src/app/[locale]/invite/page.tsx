import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AcceptInvitation } from './accept-invitation';

export default async function InvitePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ token?: string }> }) {
  const { locale } = await params; const { token = '' } = await searchParams; setRequestLocale(locale); const t = await getTranslations('Team');
  return <main id="desk-main"><h1>{t('invitationTitle')}</h1><p>{t('invitationDescription')}</p><AcceptInvitation token={token} locale={locale} labels={{ accept: t('accept'), accepting: t('accepting'), accepted: t('accepted'), missingToken: t('missingToken'), invitationFailed: t('invitationFailed'), openToday: t('openToday') }} /></main>;
}
