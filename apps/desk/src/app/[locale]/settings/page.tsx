import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SettingsClient } from './settings-client';

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Settings');
  const keys = ['aiTitle','aiDescription','on','off','enable','disable','managerOnly','integrationsTitle','connected','notConnected','active','inactive','connectGmail','connectMicrosoft','connectGoogleCalendar','connectMicrosoftCalendar','disconnect','whatsappTitle','whatsappDescription','phoneNumberId','displayPhone','accessToken','connect','readinessTitle','ready','pending','readinessPrivacy','error','provider_gmail','provider_microsoft','provider_google_calendar','provider_microsoft_calendar','provider_whatsapp','readiness_oauthSecurityConfigured','readiness_googleOAuthConfigured','readiness_microsoftOAuthConfigured','readiness_whatsappWebhookConfigured','readiness_aiGatewayConfigured','readiness_workersEnabled','readiness_calendarPushEnabled','readiness_whatsappExportEnabled'] as const;
  const labels = Object.fromEntries(keys.map((key) => [key, t(key)]));
  return <main id="desk-main"><h1>{t('title')}</h1><p>{t('subtitle')}</p><SettingsClient labels={labels} /></main>;
}
