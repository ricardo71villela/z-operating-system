import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { deskApiFetch } from '@/lib/desk-api';
import { OnboardingClient } from './onboarding-client';

// Z Desk Lite: a Z Find agency user gets the agency workspace on first
// sign-in, without filling the onboarding form.
async function linkZfindAgency(): Promise<boolean> {
  const response = await deskApiFetch('auth/link-zfind', { method: 'POST' });
  if (!response?.ok) return false;
  const result = (await response.json()) as { linked?: boolean };
  return result.linked === true;
}

export default async function WelcomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (await linkZfindAgency()) redirect(`/${locale}/requests`);
  const t = await getTranslations('Onboarding');
  return <main id="desk-main"><h1>{t('title')}</h1><p>{t('subtitle')}</p><OnboardingClient locale={locale} labels={{ createWorkspace: t('createWorkspace'), workspaceName: t('workspaceName'), create: t('create'), creating: t('creating'), ready: t('ready'), openToday: t('openToday'), sessionRequired: t('sessionRequired'), error: t('error') }} /><section className="panel"><h2>{t('invitedTitle')}</h2><p>{t('invitedDescription')}</p></section></main>;
}
