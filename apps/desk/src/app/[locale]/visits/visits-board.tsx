"use client";

import { FormEvent, useState } from 'react';

export interface VisitRequest {
  id: string;
  status: 'requested' | 'confirmed' | 'declined' | 'cancelled';
  created_at: string;
  name: string;
  email: string;
  phone: string;
  language: 'fr' | 'en';
  message: string | null;
  proposed_slots: string[];
  confirmed_start: string | null;
  confirmed_end: string | null;
  decided_at: string | null;
  decline_reason: string | null;
  buyer_notified_at: string | null;
  listing_id: string;
  listing_title: string | null;
  transaction_type: 'sale' | 'rent' | null;
  price: number | null;
  currency: string | null;
}

type Labels = Record<
  'requested' | 'confirmed' | 'declined' | 'cancelled' | 'pendingTitle' | 'historyTitle' | 'noPending' | 'noHistory'
  | 'proposedSlots' | 'confirmSlot' | 'confirming' | 'decline' | 'declining' | 'declineReason' | 'declineReasonHint'
  | 'cancel' | 'buyerNotified' | 'buyerNotNotified' | 'receivedAt' | 'visitOn' | 'error' | 'conflict' | 'sale' | 'rent'
  | 'callBuyer' | 'emailBuyer' | 'language',
  string
>;

const PARIS = 'Europe/Paris';

function slotLabel(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', {
    timeZone: PARIS, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

function price(visit: VisitRequest, locale: string) {
  if (visit.price === null || !visit.currency) return null;
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { style: 'currency', currency: visit.currency, maximumFractionDigits: 0 }).format(visit.price);
}

export function VisitsBoard({ locale, labels, initialVisits }: { locale: string; labels: Labels; initialVisits: VisitRequest[] }) {
  const [visits, setVisits] = useState(initialVisits);
  const [busy, setBusy] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const pending = visits.filter((visit) => visit.status === 'requested');
  const history = visits.filter((visit) => visit.status !== 'requested');

  async function decide(visit: VisitRequest, action: 'confirm' | 'decline', slotStart?: string) {
    setBusy(`${visit.id}:${slotStart ?? action}`);
    setErrors((current) => ({ ...current, [visit.id]: '' }));
    const response = await fetch(`/api/desk/visits/${visit.id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action === 'confirm' ? { slotStart } : { reason: reason.trim() || undefined }),
    });
    setBusy(null);
    if (!response.ok) {
      setErrors((current) => ({ ...current, [visit.id]: response.status === 409 ? labels.conflict : labels.error }));
      return;
    }
    const result = (await response.json()) as { status: VisitRequest['status']; buyerNotified: boolean };
    const now = new Date().toISOString();
    setVisits((current) => current.map((item) => item.id !== visit.id ? item : {
      ...item,
      status: result.status,
      confirmed_start: action === 'confirm' ? slotStart ?? null : null,
      decided_at: now,
      decline_reason: action === 'decline' ? reason.trim() || null : null,
      buyer_notified_at: result.buyerNotified ? now : null,
    }));
    setDeclining(null);
    setReason('');
  }

  function submitDecline(event: FormEvent, visit: VisitRequest) {
    event.preventDefault();
    void decide(visit, 'decline');
  }

  const header = (visit: VisitRequest) => (
    <>
      <div className="visit-head">
        <strong>{visit.listing_title ?? '—'}</strong>
        {visit.transaction_type && <span className="badge">{visit.transaction_type === 'rent' ? labels.rent : labels.sale}</span>}
        {price(visit, locale) && <span className="list-meta">{price(visit, locale)}</span>}
      </div>
      <div className="visit-buyer">
        <span>{visit.name}</span>
        <a href={`tel:${visit.phone.replace(/[^\d+]/g, '')}`} aria-label={labels.callBuyer}>{visit.phone}</a>
        <a href={`mailto:${visit.email}`} aria-label={labels.emailBuyer}>{visit.email}</a>
        <span className="badge">{labels.language} {visit.language.toUpperCase()}</span>
      </div>
    </>
  );

  return (
    <div className="dashboard-grid">
      <section className="panel span-8">
        <div className="panel-header"><h2>{labels.pendingTitle}</h2><span className="count-badge">{pending.length}</span></div>
        {pending.length === 0 ? <div className="empty-state">{labels.noPending}</div> : (
          <ul className="clean-list">
            {pending.map((visit) => (
              <li className="list-card visit-card" key={visit.id}>
                {header(visit)}
                {visit.message && <p className="visit-message">{visit.message}</p>}
                <div className="list-meta">{labels.receivedAt} {slotLabel(visit.created_at, locale)}</div>
                <p className="visit-label">{labels.proposedSlots}</p>
                <div className="visit-slots">
                  {visit.proposed_slots.map((slot) => (
                    <button key={slot} type="button" disabled={busy !== null} onClick={() => { void decide(visit, 'confirm', slot); }}>
                      {busy === `${visit.id}:${slot}` ? labels.confirming : `${labels.confirmSlot} · ${slotLabel(slot, locale)}`}
                    </button>
                  ))}
                </div>
                {declining === visit.id ? (
                  <form className="form-row visit-decline" onSubmit={(event) => submitDecline(event, visit)}>
                    <label>{labels.declineReason}<input value={reason} maxLength={500} placeholder={labels.declineReasonHint} onChange={(event) => setReason(event.target.value)} /></label>
                    <button type="submit" disabled={busy !== null}>{busy === `${visit.id}:decline` ? labels.declining : labels.decline}</button>
                    <button type="button" className="link-button" onClick={() => { setDeclining(null); setReason(''); }}>{labels.cancel}</button>
                  </form>
                ) : (
                  <button type="button" className="link-button" disabled={busy !== null} onClick={() => { setDeclining(visit.id); setReason(''); }}>{labels.decline}</button>
                )}
                {errors[visit.id] && <p className="notice error" role="alert">{errors[visit.id]}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel span-4">
        <div className="panel-header"><h2>{labels.historyTitle}</h2><span className="count-badge">{history.length}</span></div>
        {history.length === 0 ? <div className="empty-state">{labels.noHistory}</div> : (
          <ul className="clean-list">
            {history.map((visit) => (
              <li className="list-card" key={visit.id}>
                <span className={`badge ${visit.status === 'confirmed' ? 'green' : 'red'}`}>{labels[visit.status]}</span>
                <strong className="visit-history-title">{visit.listing_title ?? '—'}</strong>
                <div className="list-meta">{visit.name} · {visit.phone}</div>
                {visit.confirmed_start && <div className="list-meta">{labels.visitOn} {slotLabel(visit.confirmed_start, locale)}</div>}
                {visit.decline_reason && <div className="list-meta">{visit.decline_reason}</div>}
                <div className="list-meta">{visit.buyer_notified_at ? labels.buyerNotified : labels.buyerNotNotified}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
