import { setRequestLocale } from 'next-intl/server';
import { ZosMark } from '@/components/zos-mark';
import { getLeadsCopy } from '@/lib/leads-copy';

const landingCopy: Record<string, { eyebrow: string; title: string; body: string; today: string }> = {
  en: { eyebrow: 'Z Operating System', title: 'Work, in one place.', body: 'Inbox, calendar, tasks, team, personnel and now leads — one cross-product operational layer for the ZOS ecosystem.', today: 'Open Today' },
  fr: { eyebrow: 'Z Operating System', title: 'Le travail, au même endroit.', body: 'Inbox, agenda, tâches, équipe, personnel et désormais leads — une couche opérationnelle transversale pour l’écosystème ZOS.', today: 'Ouvrir Aujourd’hui' },
};

export default async function LocaleHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const copy = landingCopy[locale] ?? landingCopy.en;
  const leads = getLeadsCopy(locale);

  return (
    <main id="desk-main" className="landing landing-branded">
      <section className="landing-brand-panel" aria-label="Z Operating System">
        <ZosMark variant="chrome" className="landing-zos-mark" decorative={false} />
        <div><span>Z OPERATING SYSTEM</span><strong>Z Desk</strong></div>
      </section>
      <section className="landing-message-panel">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p className="landing-copy">{copy.body}</p>
        <div className="landing-actions"><a className="btn btn-primary" href={`/${locale}/today`}>{copy.today}</a><a className="btn" href={`/${locale}/leads`}>{leads.nav}</a></div>
      </section>
    </main>
  );
}
