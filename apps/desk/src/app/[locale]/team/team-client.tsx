"use client";

import { FormEvent, useCallback, useEffect, useState } from 'react';

type Role = 'owner' | 'admin' | 'member';
type TeamContext = { workspaceMemberId: string; role: Role };
type Member = { workspaceMemberId: string; displayName: string; role: Role; status: string; current: boolean };
type Invitation = { invitationId: string; email: string; role: 'admin' | 'member'; status: string; expiresAt: string };

export function TeamClient({ locale }: { locale: string }) {
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
    const nextMembers = membersRes.ok ? await membersRes.json() : [];
    setContext(nextContext);
    setMembers(nextMembers);
    if (nextContext?.role === 'owner' || nextContext?.role === 'admin') {
      const invitationRes = await fetch('/api/desk/team/invitations');
      setInvitations(invitationRes.ok ? await invitationRes.json() : []);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submitInvite(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null); setInviteLink(null);
    try {
      const response = await fetch('/api/desk/team/invitations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, role }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || payload?.error || 'Invitation failed');
      const link = `${window.location.origin}/${locale}/invite?token=${encodeURIComponent(payload.token)}`;
      setInviteLink(link); setEmail(''); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invitation failed'); }
    finally { setBusy(false); }
  }

  async function reissue(invitationId: string) {
    setBusy(true); setError(null); setInviteLink(null);
    try {
      const response = await fetch(`/api/desk/team/invitations/${invitationId}/reissue`, { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || payload?.error || 'Reissue failed');
      setInviteLink(`${window.location.origin}/${locale}/invite?token=${encodeURIComponent(payload.token)}`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Reissue failed'); }
    finally { setBusy(false); }
  }

  async function revoke(invitationId: string) {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/desk/team/invitations/${invitationId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Revoke failed');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Revoke failed'); }
    finally { setBusy(false); }
  }

  async function changeRole(memberId: string, nextRole: 'admin' | 'member') {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/desk/team/members/${memberId}/role`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: nextRole }),
      });
      if (!response.ok) throw new Error('Role update failed');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Role update failed'); }
    finally { setBusy(false); }
  }

  return (
    <div>
      {(context?.role === 'owner' || context?.role === 'admin') && (
        <section>
          <h2>Invite</h2>
          <form onSubmit={submitInvite}>
            <label>Email <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>{' '}
            {context.role === 'owner' && (
              <label>Role <select value={role} onChange={(event) => setRole(event.target.value as 'admin' | 'member')}><option value="member">Member</option><option value="admin">Admin</option></select></label>
            )}{' '}
            <button disabled={busy} type="submit">Create secure invitation</button>
          </form>
          {inviteLink && <p><strong>Secure invitation link:</strong> <input readOnly value={inviteLink} size={72} /> <button onClick={() => navigator.clipboard.writeText(inviteLink)}>Copy</button></p>}
        </section>
      )}

      {error && <p role="alert">{error}</p>}

      <section>
        <h2>Members</h2>
        <ul>
          {members.map((member) => (
            <li key={member.workspaceMemberId}>
              <strong>{member.displayName}</strong> — {member.role} — {member.status}{member.current ? ' (you)' : ''}{' '}
              {context?.role === 'owner' && member.role !== 'owner' && !member.current && (
                <select disabled={busy} value={member.role} onChange={(event) => changeRole(member.workspaceMemberId, event.target.value as 'admin' | 'member')}>
                  <option value="member">Member</option><option value="admin">Admin</option>
                </select>
              )}
            </li>
          ))}
        </ul>
      </section>

      {(context?.role === 'owner' || context?.role === 'admin') && (
        <section>
          <h2>Invitations</h2>
          <ul>
            {invitations.map((invitation) => (
              <li key={invitation.invitationId}>
                {invitation.email} — {invitation.role} — {invitation.status} — {new Date(invitation.expiresAt).toLocaleDateString(locale)}{' '}
                {invitation.status !== 'accepted' && <><button disabled={busy} onClick={() => reissue(invitation.invitationId)}>Reissue</button>{' '}<button disabled={busy} onClick={() => revoke(invitation.invitationId)}>Revoke</button></>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
