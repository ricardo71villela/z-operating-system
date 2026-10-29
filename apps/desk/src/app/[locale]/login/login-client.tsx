"use client";

import { FormEvent, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ZosMark } from '@/components/zos-mark';

type Labels = Record<'title' | 'subtitle' | 'email' | 'sendCode' | 'sending' | 'codeSent' | 'code' | 'verify' | 'verifying' | 'changeEmail' | 'resend' | 'invalidEmail' | 'invalidCode' | 'sendFailed' | 'tooMany' | 'notConfigured' | 'opening' | 'linkExpired', string>;

function supabase() {
  try { return createClient(); } catch { return null; }
}

// Sign-in by a one-time code sent by e-mail (the same Supabase project as
// the other ZOS apps, so one ZOS account works everywhere).
export function LoginClient({ labels, target }: { labels: Labels; target: string }) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [handoff, setHandoff] = useState(false);

  // Opened from the Z Find agency space: #zos_link=<one-time token hash>.
  // Exchanged for a Z Desk session of the same account (the Partner session
  // is never shared); the fragment never reaches a server log.
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const tokenHash = params.get('zos_link') || '';
    const type = params.get('zos_type') === 'email' ? 'email' : 'magiclink';
    if (!/^[A-Za-z0-9_-]{20,200}$/.test(tokenHash)) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    const client = supabase();
    if (!client) { setError(labels.notConfigured); return; }
    setHandoff(true);
    client.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error: linkError }) => {
      if (linkError) { setHandoff(false); setError(labels.linkExpired); return; }
      window.location.assign(target);
    });
  }, [labels.notConfigured, labels.linkExpired, target]);

  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    const client = supabase();
    if (!client) { setError(labels.notConfigured); return; }
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) { setError(labels.invalidEmail); return; }
    setBusy(true); setError('');
    const { error: sendError } = await client.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } });
    setBusy(false);
    if (sendError) { setError(sendError.status === 429 ? labels.tooMany : labels.sendFailed); return; }
    setEmail(address); setCode(''); setStep('code');
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    const client = supabase();
    if (!client) { setError(labels.notConfigured); return; }
    const token = code.replace(/\s+/g, '');
    if (!/^\d{6,10}$/.test(token)) { setError(labels.invalidCode); return; }
    setBusy(true); setError('');
    const { error: verifyError } = await client.auth.verifyOtp({ email, token, type: 'email' });
    if (verifyError) { setBusy(false); setError(labels.invalidCode); return; }
    // Full navigation so the server pages read the new session cookies.
    window.location.assign(target);
  }

  return <section className="panel login-panel">
    <div className="login-mark"><ZosMark variant="linear" className="login-mark-img" /><span><strong>Z Desk</strong><small>Z Operating System</small></span></div>
    <h1>{labels.title}</h1>
    <p>{handoff ? labels.opening : step === 'email' ? labels.subtitle : `${labels.codeSent} ${email}`}</p>
    {handoff ? null : step === 'email'
      ? <form className="login-form" onSubmit={sendCode} noValidate>
          <label>{labels.email}<input type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></label>
          <button type="submit" disabled={busy}>{busy ? labels.sending : labels.sendCode}</button>
        </form>
      : <form className="login-form" onSubmit={verify} noValidate>
          <label>{labels.code}<input autoComplete="one-time-code" inputMode="numeric" maxLength={12} required value={code} onChange={(e) => setCode(e.target.value)} autoFocus /></label>
          <button type="submit" disabled={busy}>{busy ? labels.verifying : labels.verify}</button>
          <div className="login-links">
            <button type="button" className="link-button" disabled={busy} onClick={() => { void sendCode(); }}>{labels.resend}</button>
            <button type="button" className="link-button" disabled={busy} onClick={() => { setStep('email'); setError(''); }}>{labels.changeEmail}</button>
          </div>
        </form>}
    {error && <p className="notice error" role="alert">{error}</p>}
  </section>;
}
