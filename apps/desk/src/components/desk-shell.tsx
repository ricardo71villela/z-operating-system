"use client";

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

type Labels = {
  today: string;
  inbox: string;
  tasks: string;
  calendar: string;
  personnel: string;
  contacts: string;
  team: string;
  settings: string;
  workspace: string;
};

const items = [
  ['today', 'today'],
  ['inbox', 'inbox'],
  ['tasks', 'tasks'],
  ['calendar', 'calendar'],
  ['personnel', 'personnel'],
  ['contacts', 'contacts'],
  ['team', 'team'],
  ['settings', 'settings'],
] as const;

export function DeskShell({ locale, labels, children }: { locale: string; labels: Labels; children: ReactNode }) {
  const pathname = usePathname();
  if (pathname.includes('/invite')) return <>{children}</>;

  const changeLocale = (nextLocale: string) => {
    const segments = pathname.split('/');
    segments[1] = nextLocale;
    window.location.href = segments.join('/') || `/${nextLocale}/today`;
  };

  return (
    <div className="desk-shell">
      <aside className="desk-sidebar" aria-label="Z Desk">
        <a className="desk-brand" href={`/${locale}/today`} aria-label="Z Desk home">
          <span className="desk-brand-mark">Z</span>
          <span><strong>Desk</strong><small>ZOS {labels.workspace}</small></span>
        </a>
        <nav className="desk-nav">
          {items.map(([key, route]) => {
            const href = `/${locale}/${route}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return <a key={key} href={href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}><span className="nav-dot" />{labels[key]}</a>;
          })}
        </nav>
        <div className="desk-sidebar-footer">
          <label className="language-control">
            <span className="sr-only">Language</span>
            <select value={locale} onChange={(event) => changeLocale(event.target.value)}>
              <option value="pt">PT</option><option value="en">EN</option><option value="fr">FR</option>
              <option value="es">ES</option><option value="it">IT</option><option value="de">DE</option>
            </select>
          </label>
          <span className="secure-pill">ZOS · Secure</span>
        </div>
      </aside>
      <div className="desk-content">
        <header className="desk-topbar"><div><span className="eyebrow">Z Operating System</span><strong>Z Desk</strong></div><span className="status-dot"><i /> Online</span></header>
        {children}
      </div>
    </div>
  );
}
