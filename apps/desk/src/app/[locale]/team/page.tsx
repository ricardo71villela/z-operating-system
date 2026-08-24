import { setRequestLocale } from 'next-intl/server';
import { TeamClient } from './team-client';

export default async function TeamPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main>
      <h1>Team</h1>
      <p>Invite people and manage Z Desk workspace roles.</p>
      <TeamClient locale={locale} />
    </main>
  );
}
