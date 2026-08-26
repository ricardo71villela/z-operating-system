"use client";

import { FormEvent, useState } from 'react';

export function PersonnelActions({ labels }: { labels: { selfService: string; absence: string; type: string; vacation: string; sick: string; other: string; start: string; end: string; note: string; request: string; overtime: string; date: string; hours: string; submit: string; success: string; error: string } }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [absence, setAbsence] = useState({ type: 'vacation', startDate: '', endDate: '', note: '' });
  const [overtime, setOvertime] = useState({ date: '', hours: '', note: '' });

  async function requestAbsence(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    const response = await fetch('/api/desk/personnel/absences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(absence) });
    setMessage({ kind: response.ok ? 'success' : 'error', text: response.ok ? labels.success : labels.error });
    if (response.ok) setAbsence({ type: 'vacation', startDate: '', endDate: '', note: '' });
    setBusy(false);
  }

  async function submitOvertime(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    const response = await fetch('/api/desk/personnel/overtime', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...overtime, hours: Number(overtime.hours) }) });
    setMessage({ kind: response.ok ? 'success' : 'error', text: response.ok ? labels.success : labels.error });
    if (response.ok) setOvertime({ date: '', hours: '', note: '' });
    setBusy(false);
  }

  return <section className="panel"><div className="panel-header"><h2>{labels.selfService}</h2></div><div className="personnel-actions-grid">
    <form onSubmit={requestAbsence}><h3>{labels.absence}</h3><div className="form-row"><label>{labels.type}<select value={absence.type} onChange={(event) => setAbsence({ ...absence, type: event.target.value })}><option value="vacation">{labels.vacation}</option><option value="sick">{labels.sick}</option><option value="other">{labels.other}</option></select></label><label>{labels.start}<input required type="date" value={absence.startDate} onChange={(event) => setAbsence({ ...absence, startDate: event.target.value })} /></label><label>{labels.end}<input required type="date" value={absence.endDate} onChange={(event) => setAbsence({ ...absence, endDate: event.target.value })} /></label><label>{labels.note}<input value={absence.note} onChange={(event) => setAbsence({ ...absence, note: event.target.value })} /></label><button disabled={busy}>{labels.request}</button></div></form>
    <form onSubmit={submitOvertime}><h3>{labels.overtime}</h3><div className="form-row"><label>{labels.date}<input required type="date" value={overtime.date} onChange={(event) => setOvertime({ ...overtime, date: event.target.value })} /></label><label>{labels.hours}<input required min="0.25" max="24" step="0.25" type="number" value={overtime.hours} onChange={(event) => setOvertime({ ...overtime, hours: event.target.value })} /></label><label>{labels.note}<input value={overtime.note} onChange={(event) => setOvertime({ ...overtime, note: event.target.value })} /></label><button disabled={busy}>{labels.submit}</button></div></form>
  </div>{message && <p className={`notice ${message.kind === 'error' ? 'error' : ''}`} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}</section>;
}
