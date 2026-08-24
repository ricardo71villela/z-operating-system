import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TeamClient } from './team-client';

export default async function TeamPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Team');
  const keys = ['invite','email','role','member','admin','createInvitation','secureLink','copy','members','invitations','you','reissue','revoke','expires','invitationFailed','reissueFailed','revokeFailed','roleFailed'] as const;
  return <main id="desk-main"><h1>{t('title')}</h1><p>{t('subtitle')}</p><TeamClient locale={locale} labels={Object.fromEntries(keys.map((key) => [key,t(key)]))} /></main>;
}
