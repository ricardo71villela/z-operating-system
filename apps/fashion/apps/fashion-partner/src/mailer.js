/* ============================================================
   Z FASHION — e-mail sending through Resend (task 16)
   ============================================================
   RESEND_API_KEY        Resend API key (sending only). Without it no
                         e-mail is sent: each one is logged as skipped,
                         so local runs and tests never send anything.
   FASHION_EMAIL_FROM    sender, default "Z Fashion <commandes@zfashion.online>"
                         (the domain must be verified in Resend)
   FASHION_SUPPORT_EMAIL inbox for the contact form and replies,
                         default contact@zfashion.online
   FASHION_RESEND_API_BASE  tests only

   Every send carries an idempotency key (Resend keeps it 24 h), so a
   Stripe webhook delivered twice never sends the same e-mail twice.
   Sending never throws to the caller: a failed e-mail is logged and
   must not fail an order or a decision.
   ============================================================ */

const DEFAULT_FROM = 'Z Fashion <commandes@zfashion.online>';
const DEFAULT_SUPPORT = 'contact@zfashion.online';
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

function loadMailerConfig(env = process.env) {
  return {
    apiKey: (env.RESEND_API_KEY || '').trim() || null,
    from: (env.FASHION_EMAIL_FROM || '').trim() || DEFAULT_FROM,
    support: (env.FASHION_SUPPORT_EMAIL || '').trim() || DEFAULT_SUPPORT,
    apiBase: (env.FASHION_RESEND_API_BASE || '').trim() || 'https://api.resend.com',
  };
}

function createMailer(config = loadMailerConfig(), { fetchImpl = fetch, timeoutMs = 10000, log = console } = {}) {
  /**
   * @param {object} m
   * @param {string|string[]} m.to
   * @param {{subject:string, html:string, text:string}} m.content
   * @param {string} m.key       idempotency key (stable for the event)
   * @param {string} [m.replyTo]
   * @param {string} [m.tag]     e.g. order_confirmed
   * @returns {Promise<{sent:boolean, id?:string, skipped?:string, error?:string}>}
   */
  async function send({ to, content, key, replyTo, tag }) {
    const recipients = (Array.isArray(to) ? to : [to]).filter((x) => EMAIL_RE.test(String(x || '')));
    if (!recipients.length || !content) return { sent: false, skipped: 'no_recipient' };
    if (!config.apiKey) {
      log.info && log.info('email skipped (no RESEND_API_KEY)', tag || '', key);
      return { sent: false, skipped: 'not_configured' };
    }
    const body = { from: config.from, to: recipients, subject: content.subject, html: content.html, text: content.text };
    if (replyTo && EMAIL_RE.test(replyTo)) body.reply_to = replyTo;
    if (tag) body.tags = [{ name: 'type', value: String(tag).replace(/[^A-Za-z0-9_-]/g, '_') }];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${config.apiBase}/emails`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': String(key).slice(0, 256) },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        log.error('email failed', tag || '', key, res.status, json && (json.name || json.message));
        return { sent: false, error: `resend_${res.status}` };
      }
      return { sent: true, id: json.id };
    } catch (err) {
      log.error('email failed', tag || '', key, err.name === 'AbortError' ? 'timeout' : err.message);
      return { sent: false, error: 'resend_unreachable' };
    } finally {
      clearTimeout(timer);
    }
  }
  return { send, config };
}

module.exports = { loadMailerConfig, createMailer, EMAIL_RE };
