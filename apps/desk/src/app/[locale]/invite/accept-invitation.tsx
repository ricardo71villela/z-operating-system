"use client";

import { useState } from 'react';

export function AcceptInvitation({ token, locale, labels }: { token: string; locale: string; labels: Record<string,string> }) {
  const [status, setStatus] = useState<'idle'|'busy'|'done'|'error'>('idle');
  const [message, setMessage] = useState('');
  async function accept() {
    if (!token) { setStatus('error'); setMessage(labels.missingToken); return; }
    setStatus('busy'); setMessage('');
    try {
      const response = await fetch('/api/desk/team/invitations/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      if (!response.ok) throw new Error(); setStatus('done'); setMessage(labels.accepted);
    } catch { setStatus('error'); setMessage(labels.invitationFailed); }
  }
  return <section className="panel"><button type="button" onClick={accept} disabled={status === 'busy' || status === 'done'}>{status === 'busy' ? labels.accepting : status === 'done' ? labels.accepted : labels.accept}</button>{message && <p className={`notice ${status === 'error' ? 'error' : ''}`} role={status === 'error' ? 'alert' : 'status'}>{message}</p>}{status === 'done' && <p><a className="button-link" href={`/${locale}/today`}>{labels.openToday}</a></p>}</section>;
}
