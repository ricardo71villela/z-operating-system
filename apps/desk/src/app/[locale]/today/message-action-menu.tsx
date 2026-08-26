"use client";

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

type Labels = {
  createAction: string;
  task: string;
  meeting: string;
  followUp: string;
  title: string;
  due: string;
  starts: string;
  ends: string;
  creating: string;
  created: string;
  error: string;
};

export function MessageActionMenu({ messageId, defaultTitle, labels }: { messageId: string; defaultTitle: string; labels: Labels }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [actionType, setActionType] = useState<'task' | 'meeting' | 'follow_up'>('task');
  const [title, setTitle] = useState(defaultTitle.slice(0, 120));
  const [dueDate, setDueDate] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus('busy');
    const body: Record<string, string> = { actionType, title };
    if (actionType === 'task' && dueDate) body.dueDate = new Date(dueDate).toISOString();
    if (actionType !== 'task') {
      if (startsAt) body.startsAt = new Date(startsAt).toISOString();
      if (endsAt) body.endsAt = new Date(endsAt).toISOString();
    }
    try {
      const response = await fetch(`/api/desk/messages/${messageId}/actions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('action_failed');
      setStatus('done');
      setOpen(false);
      router.refresh();
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="message-action-menu">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>{labels.createAction}</button>
      {status === 'done' && <span className="badge green" role="status">{labels.created}</span>}
      {status === 'error' && <span className="badge red" role="alert">{labels.error}</span>}
      {open && (
        <form className="inline-action-form" onSubmit={submit}>
          <label><span className="sr-only">{labels.createAction}</span><select value={actionType} onChange={(event) => setActionType(event.target.value as typeof actionType)}><option value="task">{labels.task}</option><option value="meeting">{labels.meeting}</option><option value="follow_up">{labels.followUp}</option></select></label>
          <label><span className="sr-only">{labels.title}</span><input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder={labels.title} /></label>
          {actionType === 'task' ? (
            <label><span className="sr-only">{labels.due}</span><input type="datetime-local" value={dueDate} onChange={(event) => setDueDate(event.target.value)} title={labels.due} /></label>
          ) : (
            <><label><span className="sr-only">{labels.starts}</span><input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} title={labels.starts} /></label><label><span className="sr-only">{labels.ends}</span><input required type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} title={labels.ends} /></label></>
          )}
          <button type="submit" disabled={status === 'busy'}>{status === 'busy' ? labels.creating : labels.createAction}</button>
        </form>
      )}
    </div>
  );
}
