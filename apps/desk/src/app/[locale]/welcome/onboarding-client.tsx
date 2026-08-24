"use client";

import { FormEvent, useState } from 'react';

export function OnboardingClient({ locale, labels }: { locale: string; labels: Record<string,string> }) {
  const [workspaceName, setWorkspaceName] = useState('');
  const [status, setStatus] = useState<'idle'|'busy'|'done'|'error'>('idle');
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault(); setStatus('busy'); setMessage('');
    const response = await fetch('/api/desk/auth/bootstrap-workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceName }) });
    if (!response.ok) { setStatus('error'); setMessage(response.status === 401 ? labels.sessionRequired : labels.error); return; }
    setStatus('done'); setMessage(labels.ready);
  }

  return <section className="panel onboarding-panel"><div className="panel-header"><h2>{labels.createWorkspace}</h2></div><form className="form-row" onSubmit={submit}><label>{labels.workspaceName}<input required minLength={2} value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} /></label><button disabled={status === 'busy' || status === 'done'}>{status === 'busy' ? labels.creating : labels.create}</button></form>{message && <p className={`notice ${status === 'error' ? 'error' : ''}`} role={status === 'error' ? 'alert' : 'status'}>{message}</p>}{status === 'done' && <p><a className="button-link" href={`/${locale}/today`}>{labels.openToday}</a></p>}</section>;
}
