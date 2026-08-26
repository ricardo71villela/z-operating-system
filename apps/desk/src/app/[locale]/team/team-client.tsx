"use client";

import { FormEvent, useCallback, useEffect, useState } from 'react';

type Role = 'owner' | 'admin' | 'member';
type TeamContext = { workspaceMemberId: string; role: Role };
type Member = { workspaceMemberId: string; displayName: string; role: Role; status: string; current: boolean };
type Invitation = { invitationId: string; email: string; role: 'admin' | 'member'; status: string; expiresAt: string };

export function TeamClient({ locale, labels }: { locale: string; labels: Record<string,string> }) {
  const [context, setContext] = useState<TeamContext | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [contextRes, membersRes] = await Promise.all([fetch('/api/desk/team/context'), fetch('/api/desk/team/members')]);
    const nextContext = contextRes.ok ? await contextRes.json() : null;
    setContext(nextContext); setMembers(membersRes.ok ? await membersRes.json() : []);
    if (nextContext?.role === 'owner' || nextContext?.role === 'admin') {
      const invitationRes = await fetch('/api/desk/team/invitations');
      setInvitations(invitationRes.ok ? await invitationRes.json() : []);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function submitInvite(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setInviteLink(null);
    try {
      const response = await fetch('/api/desk/team/invitations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, role }) });
      const payload = await response.json(); if (!response.ok) throw new Error(labels.invitationFailed);
      setInviteLink(`${window.location.origin}/${locale}/invite?token=${encodeURIComponent(payload.token)}`); setEmail(''); await load();
    } catch { setError(labels.invitationFailed); } finally { setBusy(false); }
  }
  async function reissue(id: string) { setBusy(true); setError(null); try { const response = await fetch(`/api/desk/team/invitations/${id}/reissue`, { method: 'POST' }); const payload = await response.json(); if (!response.ok) throw new Error(); setInviteLink(`${window.location.origin}/${locale}/invite?token=${encodeURIComponent(payload.token)}`); await load(); } catch { setError(labels.reissueFailed); } finally { setBusy(false); } }
  async function revoke(id: string) { setBusy(true); setError(null); try { const response = await fetch(`/api/desk/team/invitations/${id}`, { method: 'DELETE' }); if (!response.ok) throw new Error(); await load(); } catch { setError(labels.revokeFailed); } finally { setBusy(false); } }
  async function changeRole(memberId: string, nextRole: 'admin'|'member') { setBusy(true); setError(null); try { const response = await fetch(`/api/desk/team/members/${memberId}/role`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: nextRole }) }); if (!response.ok) throw new Error(); await load(); } catch { setError(labels.roleFailed); } finally { setBusy(false); } }

  return <div className="settings-stack">
    {(context?.role === 'owner' || context?.role === 'admin') && <section className="panel"><div className="panel-header"><h2>{labels.invite}</h2></div><form className="form-row" onSubmit={submitInvite}><label>{labels.email}<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>{context.role === 'owner' && <label>{labels.role}<select value={role} onChange={(event) => setRole(event.target.value as 'admin'|'member')}><option value="member">{labels.member}</option><option value="admin">{labels.admin}</option></select></label>}<button disabled={busy}>{labels.createInvitation}</button></form>{inviteLink && <div className="notice"><strong>{labels.secureLink}</strong><div className="form-row"><input readOnly value={inviteLink} size={60} aria-label={labels.secureLink} /><button type="button" onClick={() => navigator.clipboard.writeText(inviteLink)}>{labels.copy}</button></div></div>}</section>}
    {error && <p className="notice error" role="alert">{error}</p>}
    <section className="panel"><div className="panel-header"><h2>{labels.members}</h2><span className="count-badge">{members.length}</span></div><ul className="clean-list">{members.map((member) => <li className="list-card" key={member.workspaceMemberId}><div className="thread-heading"><strong>{member.displayName}{member.current ? ` · ${labels.you}` : ''}</strong><span className={`badge ${member.status === 'active' ? 'green' : ''}`}>{member.status}</span></div><div className="action-row"><span className="badge gold">{member.role}</span>{context?.role === 'owner' && member.role !== 'owner' && !member.current && <select disabled={busy} aria-label={labels.role} value={member.role} onChange={(event) => changeRole(member.workspaceMemberId, event.target.value as 'admin'|'member')}><option value="member">{labels.member}</option><option value="admin">{labels.admin}</option></select>}</div></li>)}</ul></section>
    {(context?.role === 'owner' || context?.role === 'admin') && <section className="panel"><div className="panel-header"><h2>{labels.invitations}</h2><span className="count-badge">{invitations.length}</span></div><ul className="clean-list">{invitations.map((invitation) => <li className="list-card" key={invitation.invitationId}><div className="thread-heading"><strong>{invitation.email}</strong><span className={`badge ${invitation.status === 'accepted' ? 'green' : invitation.status === 'pending' ? 'gold' : ''}`}>{invitation.status}</span></div><div className="list-meta">{invitation.role} · {labels.expires} {new Date(invitation.expiresAt).toLocaleDateString(locale)}</div>{invitation.status !== 'accepted' && <div className="action-row"><button disabled={busy} onClick={() => reissue(invitation.invitationId)}>{labels.reissue}</button><button disabled={busy} onClick={() => revoke(invitation.invitationId)}>{labels.revoke}</button></div>}</li>)}</ul></section>}
  </div>;
}
