'use client';

import { useMemo, useState, type FormEvent } from 'react';
import type { LeadsCopy } from '@/lib/leads-copy';

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'nurturing' | 'converted' | 'disqualified';
export type LeadPriority = 'low' | 'normal' | 'high' | 'urgent';
export type LeadSource = 'email' | 'whatsapp' | 'form' | 'referral' | 'manual' | 'other';
export type LeadDestination = 'z_find' | 'z_mobility' | 'z_jobs' | 'z_fashion' | 'z_studio' | 'z_desk';

export type LeadRecord = {
  id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  source_channel: LeadSource;
  interest: string | null;
  destination_product: LeadDestination;
  status: LeadStatus;
  priority: LeadPriority;
  score: number;
  next_follow_up_at: string | null;
  notes: string | null;
  owner_workspace_member_id: string | null;
  canonical_person_id: string | null;
  canonical_organisation_id: string | null;
  created_at: string;
  updated_at: string;
};

const stages: LeadStatus[] = ['new', 'contacted', 'qualified', 'nurturing', 'converted', 'disqualified'];
const sources: LeadSource[] = ['email', 'whatsapp', 'form', 'referral', 'manual', 'other'];
const destinations: LeadDestination[] = ['z_find', 'z_mobility', 'z_jobs', 'z_fashion', 'z_studio', 'z_desk'];
const priorities: LeadPriority[] = ['low', 'normal', 'high', 'urgent'];

export function LeadsBoard({ copy, initialLeads, unavailable }: { copy: LeadsCopy; initialLeads: LeadRecord[]; unavailable: boolean }) {
  const [leads, setLeads] = useState(initialLeads);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => Object.fromEntries(stages.map((stage) => [stage, leads.filter((lead) => lead.status === stage).length])) as Record<LeadStatus, number>, [leads]);

  async function createLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (unavailable || creating) return;
    setCreating(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      displayName: String(form.get('displayName') || '').trim() || null,
      email: String(form.get('email') || '').trim() || null,
      phone: String(form.get('phone') || '').trim() || null,
      companyName: String(form.get('companyName') || '').trim() || null,
      sourceChannel: String(form.get('sourceChannel') || 'manual'),
      interest: String(form.get('interest') || '').trim() || null,
      destinationProduct: String(form.get('destinationProduct') || 'z_desk'),
      priority: String(form.get('priority') || 'normal'),
      nextFollowUpAt: String(form.get('nextFollowUpAt') || '').trim() || null,
      notes: String(form.get('notes') || '').trim() || null,
    };
    try {
      const response = await fetch('/api/desk/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error('create_failed');
      const lead = await response.json() as LeadRecord;
      setLeads((current) => [lead, ...current]);
      event.currentTarget.reset();
    } catch {
      setError(copy.saveFailed);
    } finally {
      setCreating(false);
    }
  }

  async function moveLead(lead: LeadRecord, status: LeadStatus) {
    if (unavailable || status === lead.status || status === 'converted') return;
    setError(null);
    const previous = leads;
    setLeads((current) => current.map((item) => item.id === lead.id ? { ...item, status } : item));
    try {
      const response = await fetch(`/api/desk/leads/${lead.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      if (!response.ok) throw new Error('update_failed');
      const updated = await response.json() as LeadRecord;
      setLeads((current) => current.map((item) => item.id === lead.id ? updated : item));
    } catch {
      setLeads(previous);
      setError(copy.saveFailed);
    }
  }

  return (
    <div className="leads-layout">
      <section className="panel lead-capture-panel" aria-labelledby="lead-capture-title">
        <div className="panel-heading"><div><h2 id="lead-capture-title">{copy.newLead}</h2><p>{copy.captureHelp}</p></div><span className="badge">ZOS</span></div>
        {unavailable && <div className="lead-unavailable" role="status"><strong>{copy.unavailable}</strong><span>{copy.unavailableHelp}</span></div>}
        <form className="lead-capture-form" onSubmit={createLead}>
          <label className="field"><span>{copy.name}</span><input name="displayName" autoComplete="name" disabled={unavailable} /></label>
          <label className="field"><span>{copy.email}</span><input name="email" type="email" autoComplete="email" disabled={unavailable} /></label>
          <label className="field"><span>{copy.phone}</span><input name="phone" type="tel" autoComplete="tel" disabled={unavailable} /></label>
          <label className="field"><span>{copy.company}</span><input name="companyName" autoComplete="organization" disabled={unavailable} /></label>
          <label className="field"><span>{copy.source}</span><select name="sourceChannel" defaultValue="manual" disabled={unavailable}>{sources.map((value) => <option key={value} value={value}>{copy.sourceOptions[value]}</option>)}</select></label>
          <label className="field"><span>{copy.destination}</span><select name="destinationProduct" defaultValue="z_desk" disabled={unavailable}>{destinations.map((value) => <option key={value} value={value}>{copy.destinationOptions[value]}</option>)}</select></label>
          <label className="field"><span>{copy.priority}</span><select name="priority" defaultValue="normal" disabled={unavailable}>{priorities.map((value) => <option key={value} value={value}>{copy.priorityOptions[value]}</option>)}</select></label>
          <label className="field"><span>{copy.followUp}</span><input name="nextFollowUpAt" type="datetime-local" disabled={unavailable} /></label>
          <label className="field lead-form-wide"><span>{copy.interest}</span><input name="interest" disabled={unavailable} /></label>
          <label className="field lead-form-wide"><span>{copy.notes}</span><textarea name="notes" rows={2} disabled={unavailable} /></label>
          <div className="lead-form-actions lead-form-wide"><button className="btn btn-primary" type="submit" disabled={unavailable || creating}>{creating ? copy.creating : copy.create}</button>{error && <span className="lead-error" role="alert">{error}</span>}</div>
        </form>
      </section>

      <section className="lead-pipeline" aria-labelledby="lead-pipeline-title">
        <div className="lead-pipeline-heading"><div><p className="eyebrow">Z Desk</p><h2 id="lead-pipeline-title">{copy.pipeline}</h2></div><div className="lead-kpis">{stages.slice(0, 4).map((stage) => <span key={stage}><strong>{counts[stage]}</strong>{copy.status[stage]}</span>)}</div></div>
        <div className="lead-board" role="list">
          {stages.map((stage) => (
            <section className="lead-column" key={stage} aria-label={copy.status[stage]}>
              <header><span>{copy.status[stage]}</span><b>{counts[stage]}</b></header>
              <div className="lead-column-body">
                {leads.filter((lead) => lead.status === stage).map((lead) => (
                  <article className="lead-card" key={lead.id} role="listitem">
                    <div className="lead-card-top"><div><strong>{lead.display_name || lead.email || lead.phone || '—'}</strong>{lead.company_name && <small>{lead.company_name}</small>}</div><span className={`lead-priority priority-${lead.priority}`}>{copy.priorityOptions[lead.priority]}</span></div>
                    {lead.interest && <p>{lead.interest}</p>}
                    <div className="lead-card-meta"><span>{copy.sourceOptions[lead.source_channel]}</span><span>{copy.destinationOptions[lead.destination_product]}</span><span>{copy.score}: {lead.score}</span></div>
                    <div className="lead-card-followup">{lead.next_follow_up_at ? new Date(lead.next_follow_up_at).toLocaleString() : copy.noFollowUp}</div>
                    <label className="sr-only" htmlFor={`lead-status-${lead.id}`}>{copy.pipeline}</label>
                    <select id={`lead-status-${lead.id}`} value={lead.status} onChange={(event) => void moveLead(lead, event.target.value as LeadStatus)} disabled={unavailable || lead.status === 'converted'}>
                      {stages.filter((value) => value !== 'converted' || value === lead.status).map((value) => <option key={value} value={value}>{copy.status[value]}</option>)}
                    </select>
                  </article>
                ))}
                {counts[stage] === 0 && <p className="lead-empty">{copy.empty}</p>}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
