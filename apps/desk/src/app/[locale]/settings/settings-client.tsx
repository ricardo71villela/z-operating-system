"use client";

import { FormEvent, useCallback, useEffect, useState } from 'react';

type Role = 'owner' | 'admin' | 'member';
type Integration = { id: string; provider: string; external_account_id: string; status: string; created_at: string; updated_at: string };
type Health = { provider: string; configured: boolean; active: number; lastUpdatedAt: string | null };
type Readiness = Record<string, boolean>;
type Labels = Record<string, string>;

export function SettingsClient({ labels }: { labels: Labels }) {
  const [role, setRole] = useState<Role>('member');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [health, setHealth] = useState<Health[]>([]);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [displayPhoneNumber, setDisplayPhoneNumber] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [contextRes, aiRes, integrationsRes, healthRes] = await Promise.all([
      fetch('/api/desk/team/context'), fetch('/api/desk/settings/ai-triage'), fetch('/api/desk/integrations'), fetch('/api/desk/integrations/health'),
    ]);
    const context = contextRes.ok ? await contextRes.json() : { role: 'member' };
    setRole(context.role);
    if (aiRes.ok) setAiEnabled(Boolean((await aiRes.json()).ai_triage_enabled));
    if (integrationsRes.ok) setIntegrations(await integrationsRes.json());
    if (healthRes.ok) setHealth(await healthRes.json());
    if (context.role === 'owner' || context.role === 'admin') {
      const readinessRes = await fetch('/api/desk/settings/readiness');
      if (readinessRes.ok) setReadiness(await readinessRes.json());
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function toggleAi() {
    setBusy(true); setError(null);
    const response = await fetch('/api/desk/settings/ai-triage', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !aiEnabled }) });
    if (response.ok) setAiEnabled(Boolean((await response.json()).ai_triage_enabled)); else setError(labels.error);
    setBusy(false);
  }

  async function disconnect(id: string) {
    setBusy(true); setError(null);
    const response = await fetch(`/api/desk/integrations/${id}`, { method: 'DELETE' });
    if (!response.ok) setError(labels.error); else await load();
    setBusy(false);
  }

  async function connectWhatsapp(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    const response = await fetch('/api/desk/integrations/whatsapp/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phoneNumberId, accessToken, displayPhoneNumber }) });
    if (response.ok) { setPhoneNumberId(''); setDisplayPhoneNumber(''); setAccessToken(''); await load(); } else setError(labels.error);
    setBusy(false);
  }

  const manager = role === 'owner' || role === 'admin';
  const providerName = (provider: string) => labels[`provider_${provider}`] || provider;

  return <div className="settings-stack">
    {error && <p className="notice error" role="alert">{error}</p>}
    <section className="panel"><div className="panel-header"><h2>{labels.aiTitle}</h2><span className={`badge ${aiEnabled ? 'green' : ''}`}>{aiEnabled ? labels.on : labels.off}</span></div><p>{labels.aiDescription}</p>{manager ? <button disabled={busy} onClick={toggleAi}>{aiEnabled ? labels.disable : labels.enable}</button> : <p className="list-meta">{labels.managerOnly}</p>}</section>

    <section className="panel"><div className="panel-header"><h2>{labels.integrationsTitle}</h2><span className="count-badge">{integrations.filter((item) => item.status === 'active').length}</span></div>
      <div className="integration-grid">
        {['gmail','microsoft','google_calendar','microsoft_calendar','whatsapp'].map((provider) => { const providerHealth = health.find((item) => item.provider === provider); return <article className="integration-card" key={provider}><div><strong>{providerName(provider)}</strong><p className="list-meta">{providerHealth?.active ? labels.connected : labels.notConnected}</p></div><span className={`badge ${providerHealth?.active ? 'green' : ''}`}>{providerHealth?.active ? labels.active : labels.inactive}</span></article>; })}
      </div>
      {manager && <div className="oauth-actions"><a className="button-link" href="/api/desk/integrations/email/gmail/authorize">{labels.connectGmail}</a><a className="button-link" href="/api/desk/integrations/email/microsoft/authorize">{labels.connectMicrosoft}</a><a className="button-link" href="/api/desk/integrations/calendar/google/authorize">{labels.connectGoogleCalendar}</a><a className="button-link" href="/api/desk/integrations/calendar/microsoft/authorize">{labels.connectMicrosoftCalendar}</a></div>}
      <ul className="clean-list integration-list">{integrations.map((integration) => <li className="list-card" key={integration.id}><div className="thread-heading"><strong>{providerName(integration.provider)}</strong><span className={`badge ${integration.status === 'active' ? 'green' : ''}`}>{integration.status}</span></div><div className="list-meta">{integration.external_account_id}</div>{manager && integration.status === 'active' && <div className="action-row"><button disabled={busy} onClick={() => disconnect(integration.id)}>{labels.disconnect}</button></div>}</li>)}</ul>
    </section>

    {manager && <section className="panel"><div className="panel-header"><h2>{labels.whatsappTitle}</h2></div><p>{labels.whatsappDescription}</p><form className="form-row" onSubmit={connectWhatsapp}><label>{labels.phoneNumberId}<input required value={phoneNumberId} onChange={(event) => setPhoneNumberId(event.target.value)} /></label><label>{labels.displayPhone}<input value={displayPhoneNumber} onChange={(event) => setDisplayPhoneNumber(event.target.value)} /></label><label>{labels.accessToken}<input required type="password" autoComplete="off" value={accessToken} onChange={(event) => setAccessToken(event.target.value)} /></label><button disabled={busy}>{labels.connect}</button></form></section>}

    {manager && readiness && <section className="panel"><div className="panel-header"><h2>{labels.readinessTitle}</h2></div><div className="readiness-grid">{Object.entries(readiness).map(([key, value]) => <div className="readiness-row" key={key}><span>{labels[`readiness_${key}`] || key}</span><span className={`badge ${value ? 'green' : 'gold'}`}>{value ? labels.ready : labels.pending}</span></div>)}</div><p className="list-meta">{labels.readinessPrivacy}</p></section>}
  </div>;
}
