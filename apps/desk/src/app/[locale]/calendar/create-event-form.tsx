"use client";

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export function CreateEventForm({ labels }: { labels: { newEvent: string; title: string; starts: string; ends: string; meeting: string; followUp: string; create: string; creating: string; error: string } }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [eventType, setEventType] = useState<'meeting' | 'follow_up_block'>('meeting');
  const [status, setStatus] = useState<'idle' | 'busy' | 'error'>('idle');

  async function submit(event: FormEvent) {
    event.preventDefault(); setStatus('busy');
    const response = await fetch('/api/desk/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), eventType }) });
    if (!response.ok) { setStatus('error'); return; }
    setTitle(''); setStartsAt(''); setEndsAt(''); setStatus('idle'); router.refresh();
  }

  return <section className="panel"><div className="panel-header"><h2>{labels.newEvent}</h2></div><form className="form-row" onSubmit={submit}>
    <label>{labels.title}<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label>{labels.starts}<input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
    <label>{labels.ends}<input required type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label>
    <label><span className="sr-only">Type</span><select value={eventType} onChange={(event) => setEventType(event.target.value as typeof eventType)}><option value="meeting">{labels.meeting}</option><option value="follow_up_block">{labels.followUp}</option></select></label>
    <button disabled={status === 'busy'}>{status === 'busy' ? labels.creating : labels.create}</button>
    {status === 'error' && <span className="badge red" role="alert">{labels.error}</span>}
  </form></section>;
}
