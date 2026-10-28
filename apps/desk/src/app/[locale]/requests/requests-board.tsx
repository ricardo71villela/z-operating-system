"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { deskNotificationsSupported, requestDeskNotifications } from '@/lib/request-alerts';

export interface MarketplaceRequest {
  source: 'z_find';
  id: string;
  kind: 'contact' | 'visit';
  status: 'new' | 'contacted' | 'closed';
  created_at: string;
  responded_at: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  item_id: string | null;
  item_title: string | null;
  transaction_type: 'sale' | 'rent' | null;
  price: number | null;
  currency: string | null;
}

export type RequestsLabels = Record<
  'newTitle' | 'doneTitle' | 'noNew' | 'noDone' | 'contact' | 'visit' | 'zFind' | 'new' | 'contacted' | 'closed'
  | 'markContacted' | 'markClosed' | 'reopen' | 'saving' | 'error' | 'receivedAt' | 'call' | 'email' | 'whatsapp'
  | 'viewListing' | 'openVisits' | 'sale' | 'rent' | 'replySubject' | 'replyGreeting' | 'whatsappText'
  | 'enableAlerts' | 'alertsOn' | 'alertsBlocked' | 'alertTitle' | 'alertBody',
  string
>;

type AlertState = 'unsupported' | 'default' | 'granted' | 'denied';
const noSubscription = () => () => {};

const PARIS = 'Europe/Paris';
const REFRESH_MS = 60_000;
const ZFIND_URL = 'https://zfind.online';

function when(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', {
    timeZone: PARIS, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

function price(request: MarketplaceRequest, locale: string) {
  if (request.price === null || !request.currency) return null;
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { style: 'currency', currency: request.currency, maximumFractionDigits: 0 }).format(request.price);
}

/** International digits for wa.me, or null when the country cannot be known
    (+/00 numbers, and French mobiles 06/07 which are the common case). */
export function whatsappNumber(phone: string | null): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+') && digits.length >= 8) return digits;
  if (digits.startsWith('00') && digits.length >= 10) return digits.slice(2);
  if (/^0[67]\d{8}$/.test(digits)) return `33${digits.slice(1)}`;
  return null;
}

export function RequestsBoard({ locale, labels, initialRequests }: { locale: string; labels: RequestsLabels; initialRequests: MarketplaceRequest[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const permission = useSyncExternalStore(
    noSubscription,
    () => (deskNotificationsSupported() ? (Notification.permission as AlertState) : 'unsupported'),
    () => 'unsupported' as AlertState,
  );
  const [chosen, setChosen] = useState<AlertState | null>(null);
  const alerts = chosen ?? permission;

  const refresh = useCallback(async () => {
    const response = await fetch('/api/desk/requests', { cache: 'no-store' }).catch(() => null);
    if (!response?.ok) return;
    setRequests((await response.json()) as MarketplaceRequest[]);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, REFRESH_MS);
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [refresh]);

  async function setStatus(request: MarketplaceRequest, status: MarketplaceRequest['status']) {
    const key = `${request.source}:${request.id}`;
    setBusy(`${key}:${status}`);
    setErrors((current) => ({ ...current, [key]: '' }));
    const response = await fetch(`/api/desk/requests/${request.source}/${request.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    setBusy(null);
    if (!response?.ok) {
      setErrors((current) => ({ ...current, [key]: labels.error }));
      return;
    }
    const now = new Date().toISOString();
    setRequests((current) => current.map((item) => item.source === request.source && item.id === request.id
      ? { ...item, status, responded_at: status === 'new' ? item.responded_at : item.responded_at ?? now }
      : item));
  }

  async function enableAlerts() {
    setChosen(await requestDeskNotifications());
  }

  const open = requests.filter((request) => request.status === 'new');
  const done = requests.filter((request) => request.status !== 'new');

  const mailto = (request: MarketplaceRequest) => {
    const subject = `${labels.replySubject}${request.item_title ? ` — ${request.item_title}` : ''}`;
    const body = `${labels.replyGreeting}${request.name ? ` ${request.name}` : ''},\n\n`;
    return `mailto:${request.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const card = (request: MarketplaceRequest, compact: boolean) => {
    const key = `${request.source}:${request.id}`;
    const wa = whatsappNumber(request.phone);
    const waText = `${labels.whatsappText}${request.item_title ? ` (${request.item_title})` : ''}.`;
    return (
      <li className={`list-card request-card${compact ? ' compact' : ''}`} key={key}>
        <div className="visit-head">
          <span className="badge source">{labels.zFind}</span>
          <span className={`badge ${request.kind === 'visit' ? 'gold' : ''}`}>{request.kind === 'visit' ? labels.visit : labels.contact}</span>
          {compact && <span className={`badge ${request.status === 'closed' ? 'red' : 'green'}`}>{labels[request.status]}</span>}
        </div>
        <div className="visit-head">
          <strong>{request.item_title ?? '—'}</strong>
          {request.transaction_type && <span className="badge">{request.transaction_type === 'rent' ? labels.rent : labels.sale}</span>}
          {price(request, locale) && <span className="list-meta">{price(request, locale)}</span>}
        </div>
        <div className="visit-buyer">
          <span>{request.name ?? '—'}</span>
          {request.phone && <a href={`tel:${request.phone.replace(/[^\d+]/g, '')}`}>{request.phone}</a>}
          {request.email && <a href={`mailto:${request.email}`}>{request.email}</a>}
        </div>
        {!compact && request.message && <p className="visit-message">{request.message}</p>}
        <div className="list-meta">{labels.receivedAt} {when(request.created_at, locale)}</div>
        {!compact && (
          <div className="request-actions">
            {request.phone && <a className="button-link" href={`tel:${request.phone.replace(/[^\d+]/g, '')}`}>{labels.call}</a>}
            {request.email && <a className="button-link" href={mailto(request)}>{labels.email}</a>}
            {wa && <a className="button-link" href={`https://wa.me/${wa}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer">{labels.whatsapp}</a>}
            {request.kind === 'visit' && <a className="button-link" href={`/${locale}/visits`}>{labels.openVisits}</a>}
            {request.item_id && <a className="link-button" href={`${ZFIND_URL}/#/${locale === 'en' ? 'en' : 'fr'}/property/${request.item_id}`} target="_blank" rel="noopener noreferrer">{labels.viewListing}</a>}
          </div>
        )}
        <div className="request-actions">
          {request.status === 'new' ? (
            <>
              <button type="button" disabled={busy !== null} onClick={() => { void setStatus(request, 'contacted'); }}>{busy === `${key}:contacted` ? labels.saving : labels.markContacted}</button>
              <button type="button" className="link-button" disabled={busy !== null} onClick={() => { void setStatus(request, 'closed'); }}>{busy === `${key}:closed` ? labels.saving : labels.markClosed}</button>
            </>
          ) : (
            <button type="button" className="link-button" disabled={busy !== null} onClick={() => { void setStatus(request, 'new'); }}>{busy === `${key}:new` ? labels.saving : labels.reopen}</button>
          )}
        </div>
        {errors[key] && <p className="notice error" role="alert">{errors[key]}</p>}
      </li>
    );
  };

  return (
    <>
      <div className="request-alerts">
        {alerts === 'default' && <button type="button" onClick={() => { void enableAlerts(); }}>{labels.enableAlerts}</button>}
        {alerts === 'granted' && <span className="badge green">{labels.alertsOn}</span>}
        {alerts === 'denied' && <span className="list-meta">{labels.alertsBlocked}</span>}
      </div>
      <div className="dashboard-grid">
        <section className="panel span-8" aria-live="polite">
          <div className="panel-header"><h2>{labels.newTitle}</h2><span className="count-badge">{open.length}</span></div>
          {open.length === 0 ? <div className="empty-state">{labels.noNew}</div> : <ul className="clean-list">{open.map((request) => card(request, false))}</ul>}
        </section>
        <section className="panel span-4">
          <div className="panel-header"><h2>{labels.doneTitle}</h2><span className="count-badge">{done.length}</span></div>
          {done.length === 0 ? <div className="empty-state">{labels.noDone}</div> : <ul className="clean-list">{done.map((request) => card(request, true))}</ul>}
        </section>
      </div>
    </>
  );
}
