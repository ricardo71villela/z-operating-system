import { setRequestLocale } from 'next-intl/server';
import { ZosMark } from '@/components/zos-mark';
import { getLeadsCopy } from '@/lib/leads-copy';

const landingCopy: Record<string, { eyebrow: string; title: string; body: string; today: string }> = {
  pt: { eyebrow: 'Z Operating System', title: 'O trabalho num só lugar.', body: 'Inbox, agenda, tarefas, equipa, pessoal e agora leads — uma camada operacional transversal para o ecossistema ZOS.', today: 'Abrir Hoje' },
  en: { eyebrow: 'Z Operating System', title: 'Work, in one place.', body: 'Inbox, calendar, tasks, team, personnel and now leads — one cross-product operational layer for the ZOS ecosystem.', today: 'Open Today' },
  fr: { eyebrow: 'Z Operating System', title: 'Le travail, au même endroit.', body: 'Inbox, agenda, tâches, équipe, personnel et désormais leads — une couche opérationnelle transversale pour l’écosystème ZOS.', today: 'Ouvrir Aujourd’hui' },
  es: { eyebrow: 'Z Operating System', title: 'El trabajo, en un solo lugar.', body: 'Inbox, calendario, tareas, equipo, personal y ahora leads — una capa operativa transversal para el ecosistema ZOS.', today: 'Abrir Hoy' },
  it: { eyebrow: 'Z Operating System', title: 'Il lavoro, in un unico posto.', body: 'Inbox, calendario, attività, team, personale e ora lead — un livello operativo trasversale per l’ecosistema ZOS.', today: 'Apri Oggi' },
  de: { eyebrow: 'Z Operating System', title: 'Arbeit, an einem Ort.', body: 'Inbox, Kalender, Aufgaben, Team, Personal und jetzt Leads — eine produktübergreifende operative Ebene für das ZOS-Ökosystem.', today: 'Heute öffnen' },
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
