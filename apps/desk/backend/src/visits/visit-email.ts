/**
 * Buyer e-mail after an agency confirms or declines a Z Find visit
 * request in Z Desk. The buyer asked on Z Find, so the message is sent
 * as Z Find (ZFIND_EMAIL_FROM), in the language the buyer used (FR/EN).
 *
 * Sending is best-effort: without RESEND_API_KEY / ZFIND_EMAIL_FROM the
 * decision is still recorded and the agency sees "buyer not notified",
 * so it can call the buyer instead.
 */

export interface VisitDecision {
  status: 'confirmed' | 'declined';
  slotStart: string | null;
  slotEnd: string | null;
  buyerName: string;
  buyerEmail: string;
  language: 'fr' | 'en';
  listingId: string;
  listingTitle: string | null;
  agencyName: string | null;
  reason: string | null;
}

const PARIS = 'Europe/Paris';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

export function formatSlot(iso: string, language: 'fr' | 'en'): string {
  const date = new Date(iso);
  const locale = language === 'en' ? 'en-GB' : 'fr-FR';
  const day = new Intl.DateTimeFormat(locale, { timeZone: PARIS, weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  const time = new Intl.DateTimeFormat(locale, { timeZone: PARIS, hour: '2-digit', minute: '2-digit' }).format(date);
  return language === 'en' ? `${day} at ${time}` : `${day} à ${time}`;
}

function siteUrl(): string {
  return (process.env.ZFIND_SITE_BASE_URL ?? 'https://zfind.online').replace(/\/+$/, '');
}

export function buildVisitEmail(d: VisitDecision): { subject: string; text: string; html: string } {
  const en = d.language === 'en';
  const title = d.listingTitle ?? (en ? 'the property' : 'le bien');
  const agency = d.agencyName ?? (en ? 'The agency' : 'L’agence');
  const lines: string[] = [];
  let subject: string;

  if (d.status === 'confirmed' && d.slotStart) {
    const when = formatSlot(d.slotStart, d.language);
    subject = en ? `Visit confirmed — ${when}` : `Visite confirmée — ${when}`;
    lines.push(en ? `Hello ${d.buyerName},` : `Bonjour ${d.buyerName},`);
    lines.push(en
      ? `${agency} confirms your visit of “${title}” on ${when} (Paris time).`
      : `${agency} confirme votre visite de « ${title} » le ${when}.`);
    lines.push(en
      ? 'The agency will contact you if anything changes. If you can no longer come, please let them know.'
      : 'L’agence vous contactera en cas de changement. Si vous ne pouvez plus venir, merci de la prévenir.');
  } else {
    subject = en ? 'Your visit request' : 'Votre demande de visite';
    lines.push(en ? `Hello ${d.buyerName},` : `Bonjour ${d.buyerName},`);
    lines.push(en
      ? `${agency} cannot offer the times you proposed for “${title}”.`
      : `${agency} ne peut pas vous recevoir aux horaires proposés pour « ${title} ».`);
    if (d.reason) lines.push(en ? `Agency’s note: ${d.reason}` : `Message de l’agence : ${d.reason}`);
    lines.push(en
      ? 'You can propose other times from the listing page on Z Find.'
      : 'Vous pouvez proposer d’autres horaires depuis la page de l’annonce sur Z Find.');
  }

  const url = siteUrl();
  const footer = en
    ? 'You receive this e-mail because you requested a visit on zfind.online. Z Find · hello@zfind.online'
    : 'Vous recevez cet e-mail car vous avez demandé une visite sur zfind.online. Z Find · hello@zfind.online';
  const linkLabel = 'zfind.online';

  const text = [...lines, `${linkLabel}: ${url}`, '', footer].join('\n\n');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1d1d1f;max-width:560px">${lines
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('')}<p><a href="${escapeHtml(url)}" style="color:#0b5cad">${escapeHtml(linkLabel)}</a></p><p style="font-size:12px;color:#6e6e73">${escapeHtml(footer)}</p></div>`;
  return { subject, text, html };
}

export async function sendVisitEmail(d: VisitDecision): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ZFIND_EMAIL_FROM;
  if (!apiKey || !from) return false;
  const message = buildVisitEmail(d);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [d.buyerEmail], subject: message.subject, text: message.text, html: message.html }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
