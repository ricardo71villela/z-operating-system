"use client";

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getLeadsCopy } from '@/lib/leads-copy';
import { ZosMark } from '@/components/zos-mark';
import { createClient } from '@/lib/supabase/client';
import { notifyNewRequests } from '@/lib/request-alerts';

type Labels = { today: string; requests: string; requestsAlertTitle: string; requestsAlertBody: string; visits: string; inbox: string; tasks: string; calendar: string; personnel: string; contacts: string; team: string; settings: string; workspace: string; skipToContent: string; signOut: string };

const SUMMARY_MS = 60_000;

/* Unread marketplace requests: nav badge + opt-in browser notification
   when a new one arrives (Z Desk Lite). */
function useNewRequests(enabled: boolean, labels: Labels, locale: string) {
  const [count, setCount] = useState<number | null>(null);
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const load = async () => {
      const response = await fetch('/api/desk/requests/summary', { cache: 'no-store' }).catch(() => null);
      if (!response?.ok || stopped) return;
      const summary = (await response.json()) as { new?: number };
      const value = Number(summary?.new) || 0;
      if (last.current !== null && value > last.current) notifyNewRequests(value - last.current, labels.requestsAlertTitle, labels.requestsAlertBody, `/${locale}/requests`);
      last.current = value;
      setCount(value);
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, SUMMARY_MS);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [enabled, labels.requestsAlertBody, labels.requestsAlertTitle, locale]);
  return count;
}

export function DeskShell({ locale, labels, children }: { locale: string; labels: Labels; children: ReactNode }) {
  const pathname = usePathname();
  const bare = pathname.includes('/invite') || /^\/[a-z]{2}\/(login|welcome)(\/|$)/.test(pathname);
  const newRequests = useNewRequests(!bare, labels, locale);
  if (pathname.includes('/invite')) return <>{children}</>;
  if (/^\/[a-z]{2}\/login(\/|$)/.test(pathname)) return <div className="login-shell">{children}</div>;
  const leadCopy = getLeadsCopy(locale);
  const items = [
    ['today', labels.today],
    ['requests', labels.requests],
    ['visits', labels.visits],
    ['inbox', labels.inbox],
    ['tasks', labels.tasks],
    ['calendar', labels.calendar],
    ['personnel', labels.personnel],
    ['contacts', labels.contacts],
    ['leads', leadCopy.nav],
    ['team', labels.team],
    ['settings', labels.settings],
  ] as const;
  const signOut = async () => {
    try { await createClient().auth.signOut(); } catch { /* not configured: nothing to sign out of */ }
    window.location.assign(`/${locale}/login`);
  };
  const changeLocale = (nextLocale: string) => { const segments = pathname.split('/'); segments[1] = nextLocale; window.location.href = segments.join('/') || `/${nextLocale}/today`; };
  return <div className="desk-shell">
    <a className="skip-link" href="#desk-main">{labels.skipToContent}</a>
    <aside className="desk-sidebar" aria-label="Z Desk">
      <a className="desk-brand" href={`/${locale}/today`} aria-label="Z Desk home"><span className="desk-brand-mark"><ZosMark variant="chrome" /></span><span><strong>Desk</strong><small>ZOS {labels.workspace}</small></span></a>
      <nav className="desk-nav">{items.map(([route, label]) => { const href = `/${locale}/${route}`; const active = pathname === href || pathname.startsWith(`${href}/`); return <a key={route} href={href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}><span className="nav-dot" />{label}{route === 'requests' && newRequests ? <span className="nav-count" aria-label={`${newRequests}`}>{newRequests}</span> : null}</a>; })}</nav>
      <div className="desk-sidebar-footer"><label className="language-control"><span className="sr-only">Language</span><select value={locale} onChange={(event) => changeLocale(event.target.value)}><option value="fr">FR</option><option value="en">EN</option></select></label><span className="secure-pill">ZOS · Secure</span><button type="button" className="link-button sign-out" onClick={() => { void signOut(); }}>{labels.signOut}</button></div>
    </aside>
    <div className="desk-content"><header className="desk-topbar"><div className="desk-topbar-brand"><ZosMark variant="linear" className="desk-topbar-mark" /><div><span className="eyebrow">Z Operating System</span><strong>Z Desk</strong></div></div><span className="status-dot"><i /> Online</span></header>{children}</div>
  </div>;
}
