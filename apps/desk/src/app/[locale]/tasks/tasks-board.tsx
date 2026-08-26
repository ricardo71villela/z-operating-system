"use client";

import { FormEvent, useEffect, useState } from 'react';

type Task = { id: string; title: string; description: string | null; assigned_to: string; task_type: 'personal' | 'mission'; status: 'todo' | 'in_progress' | 'done'; due_date: string | null };
type Board = { todo: Task[]; in_progress: Task[]; done: Task[] };
type Member = { workspaceMemberId: string; displayName: string; role: string };
type Labels = { todo: string; inProgress: string; done: string; personal: string; mission: string; assignedTo: string; noTasks: string; newTask: string; title: string; due: string; create: string; creating: string; moveBack: string; moveNext: string };

const order: Array<keyof Board> = ['todo', 'in_progress', 'done'];

export function TasksBoard({ initialBoard, locale, labels }: { initialBoard: Board; locale: string; labels: Labels }) {
  const [board, setBoard] = useState(initialBoard);
  const [members, setMembers] = useState<Member[]>([]);
  const [role, setRole] = useState<string>('member');
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([fetch('/api/desk/team/context'), fetch('/api/desk/team/members')]).then(async ([contextRes, membersRes]) => {
      if (contextRes.ok) setRole((await contextRes.json()).role);
      if (membersRes.ok) setMembers(await membersRes.json());
    });
  }, []);

  async function reload() {
    const response = await fetch('/api/desk/tasks', { cache: 'no-store' });
    if (response.ok) setBoard(await response.json());
  }

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    const response = await fetch('/api/desk/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, dueDate: dueDate ? new Date(dueDate).toISOString() : undefined }) });
    if (response.ok) { setTitle(''); setDueDate(''); await reload(); }
    setBusy(false);
  }

  async function move(task: Task, direction: -1 | 1) {
    const index = order.indexOf(task.status);
    const next = order[index + direction];
    if (!next) return;
    setBusy(true);
    const response = await fetch(`/api/desk/tasks/${task.id}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) });
    if (response.ok) await reload();
    setBusy(false);
  }

  async function reassign(taskId: string, assignedTo: string) {
    setBusy(true);
    const response = await fetch(`/api/desk/tasks/${taskId}/reassign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignedTo }) });
    if (response.ok) await reload();
    setBusy(false);
  }

  const labelsByColumn: Record<keyof Board, string> = { todo: labels.todo, in_progress: labels.inProgress, done: labels.done };
  const memberName = (id: string) => members.find((member) => member.workspaceMemberId === id)?.displayName || id.slice(0, 8);

  return (
    <>
      <section className="panel task-create-panel">
        <div className="panel-header"><h2>{labels.newTask}</h2></div>
        <form className="form-row" onSubmit={create}>
          <label>{labels.title}<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>{labels.due}<input type="datetime-local" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
          <button disabled={busy}>{busy ? labels.creating : labels.create}</button>
        </form>
      </section>
      <div className="kanban">
        {order.map((column) => <section className="kanban-column" key={column}><h2>{labelsByColumn[column]} <span className="count-badge">{board[column].length}</span></h2>{board[column].length === 0 && <div className="empty-state">{labels.noTasks}</div>}{board[column].map((task) => <article className="task-card" key={task.id}>
          <span className={`badge ${task.task_type === 'mission' ? 'gold' : ''}`}>{task.task_type === 'mission' ? labels.mission : labels.personal}</span>
          <strong>{task.title}</strong>
          {task.description && <p className="list-meta">{task.description}</p>}
          <div className="list-meta">{labels.assignedTo}: {memberName(task.assigned_to)}{task.due_date ? ` · ${new Date(task.due_date).toLocaleDateString(locale)}` : ''}</div>
          {(role === 'owner' || role === 'admin') && members.length > 0 && <div className="action-row"><select aria-label={labels.assignedTo} disabled={busy} value={task.assigned_to} onChange={(event) => reassign(task.id, event.target.value)}>{members.filter((member) => member.role !== 'owner' || role === 'owner').map((member) => <option key={member.workspaceMemberId} value={member.workspaceMemberId}>{member.displayName}</option>)}</select></div>}
          <div className="action-row">{order.indexOf(column) > 0 && <button disabled={busy} onClick={() => move(task, -1)}>{labels.moveBack}</button>}{order.indexOf(column) < order.length - 1 && <button disabled={busy} onClick={() => move(task, 1)}>{labels.moveNext}</button>}</div>
        </article>)}</section>)}
      </div>
    </>
  );
}
