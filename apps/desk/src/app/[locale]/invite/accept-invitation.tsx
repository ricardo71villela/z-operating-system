"use client";

import { useState } from 'react';

export function AcceptInvitation({ token, locale }: { token: string; locale: string }) {
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function accept() {
    if (!token) { setStatus('error'); setMessage('Invitation token is missing.'); return; }
    setStatus('busy'); setMessage('');
    try {
      const response = await fetch('/api/desk/team/invitations/accept', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || payload?.error || 'Invitation could not be accepted.');
      setStatus('done'); setMessage('Invitation accepted.');
    } catch (cause) {
      setStatus('error'); setMessage(cause instanceof Error ? cause.message : 'Invitation could not be accepted.');
    }
  }

  return (
    <div>
      <button type="button" onClick={accept} disabled={status === 'busy' || status === 'done'}>
        {status === 'busy' ? 'Accepting…' : status === 'done' ? 'Accepted' : 'Accept invitation'}
      </button>
      {message && <p role={status === 'error' ? 'alert' : 'status'}>{message}</p>}
      {status === 'done' && <p><a href={`/${locale}/today`}>Open Z Desk Today</a></p>}
    </div>
  );
}
