import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LoginClient } from './login-client';

const KEYS = ['title', 'subtitle', 'email', 'sendCode', 'sending', 'codeSent', 'code', 'verify', 'verifying', 'changeEmail', 'resend', 'invalidEmail', 'invalidCode', 'sendFailed', 'tooMany', 'notConfigured', 'opening', 'linkExpired'] as const;

export default async function LoginPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string }> }) {
  const { locale } = await params;
  const { next = '' } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('Login');
  const labels = Object.fromEntries(KEYS.map((key) => [key, t(key)])) as Record<(typeof KEYS)[number], string>;
  // Only a path inside Z Desk for this locale: never an external URL.
  const target = next.startsWith(`/${locale}/`) && !next.startsWith('//') && !next.includes('\\') ? next : `/${locale}/today`;
  return <main id="desk-main" className="login-page"><LoginClient labels={labels} target={target} /></main>;
}
