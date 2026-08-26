"use client";

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { getLeadsCopy } from '@/lib/leads-copy';
import { ZosMark } from '@/components/zos-mark';

type Labels = { today: string; inbox: string; tasks: string; calendar: string; personnel: string; contacts: string; team: string; settings: string; workspace: string; skipToContent: string };

export function DeskShell({ locale, labels, children }: { locale: string; labels: Labels; children: ReactNode }) {
  const pathname = usePathname();
  if (pathname.includes('/invite')) return <>{children}</>;
  const leadCopy = getLeadsCopy(locale);
  const items = [
    ['today', labels.today],
    ['inbox', labels.inbox],
    ['tasks', labels.tasks],
    ['calendar', labels.calendar],
    ['personnel', labels.personnel],
    ['contacts', labels.contacts],
    ['leads', leadCopy.nav],
    ['team', labels.team],
    ['settings', labels.settings],
  ] as const;
  const changeLocale = (nextLocale: string) => { const segments = pathname.split('/'); segments[1] = nextLocale; window.location.href = segments.join('/') || `/${nextLocale}/today`; };
  return <div className="desk-shell">
    <a className="skip-link" href="#desk-main">{labels.skipToContent}</a>
    <aside className="desk-sidebar" aria-label="Z Desk">
      <a className="desk-brand" href={`/${locale}/today`} aria-label="Z Desk home"><span className="desk-brand-mark"><ZosMark variant="chrome" /></span><span><strong>Desk</strong><small>ZOS {labels.workspace}</small></span></a>
      <nav className="desk-nav">{items.map(([route, label]) => { const href = `/${locale}/${route}`; const active = pathname === href || pathname.startsWith(`${href}/`); return <a key={route} href={href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}><span className="nav-dot" />{label}</a>; })}</nav>
      <div className="desk-sidebar-footer"><label className="language-control"><span className="sr-only">Language</span><select value={locale} onChange={(event) => changeLocale(event.target.value)}><option value="pt">PT</option><option value="en">EN</option><option value="fr">FR</option><option value="es">ES</option><option value="it">IT</option><option value="de">DE</option></select></label><span className="secure-pill">ZOS · Secure</span></div>
    </aside>
    <div className="desk-content"><header className="desk-topbar"><div className="desk-topbar-brand"><ZosMark variant="linear" className="desk-topbar-mark" /><div><span className="eyebrow">Z Operating System</span><strong>Z Desk</strong></div></div><span className="status-dot"><i /> Online</span></header>{children}</div>
  </div>;
}
