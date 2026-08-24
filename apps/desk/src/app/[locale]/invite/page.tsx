import { setRequestLocale } from 'next-intl/server';
import { AcceptInvitation } from './accept-invitation';

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  const { token = '' } = await searchParams;
  setRequestLocale(locale);
  return (
    <main>
      <h1>Z Desk invitation</h1>
      <p>Sign in with the verified email address that received this invitation, then accept it.</p>
      <AcceptInvitation token={token} locale={locale} />
    </main>
  );
}
