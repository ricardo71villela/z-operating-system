import { getTranslations, setRequestLocale } from 'next-intl/server';
import { OnboardingClient } from './onboarding-client';

export default async function WelcomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Onboarding');
  return <main id="desk-main"><h1>{t('title')}</h1><p>{t('subtitle')}</p><OnboardingClient locale={locale} labels={{ createWorkspace: t('createWorkspace'), workspaceName: t('workspaceName'), create: t('create'), creating: t('creating'), ready: t('ready'), openToday: t('openToday'), sessionRequired: t('sessionRequired'), error: t('error') }} /><section className="panel"><h2>{t('invitedTitle')}</h2><p>{t('invitedDescription')}</p></section></main>;
}
