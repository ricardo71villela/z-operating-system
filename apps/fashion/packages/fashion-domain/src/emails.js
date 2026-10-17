/* ============================================================
   Z FASHION — TRANSACTIONAL E-MAILS (bounded context: fashion-domain)
   ============================================================
   Task 16. The text of every e-mail Z Fashion sends, in French, as
   { subject, text, html }. Pure functions: the API decides when to
   send (fashion-partner/src/mailer.js sends through Resend).

     orderConfirmed      client — the order is paid
     storeNewOrder       store  — a paid order to prepare and ship
     applicationDecision store  — its application was approved,
                                  refused, activated or suspended
     productRefused      store  — a product was refused or withdrawn
     contactMessage      Z Fashion support — a message from the site
     contactReceipt      client — copy of the message they sent

   Every value from outside goes through esc() in the HTML version.
   The sign-in code e-mails are sent by Supabase Auth (SMTP through
   Resend), not from here.
   ============================================================ */

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (minor) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format((minor || 0) / 100).replace(/ | /g, ' ');
const ref = (orderId) => 'ZF-' + String(orderId || '').slice(0, 8).toUpperCase();
const date = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });

function sizeOf(line) {
  if (line.size && line.size.value != null) return `taille ${line.size.value}`;
  if (line.format && line.format.volumeMl != null) return `${line.format.volumeMl} ml`;
  if (line.format && line.format.shade) return `teinte ${line.format.shade}`;
  return '';
}
function lineLabel(l) {
  return [l.brandName, l.name].filter(Boolean).join(' — ') + (sizeOf(l) ? ` (${sizeOf(l)})` : '');
}
function addressLines(a) {
  if (!a) return [];
  return [a.recipientName, a.line1, a.line2, `${a.postalCode || ''} ${a.city || ''}`.trim(), a.countryIso === 'FR' ? 'France' : a.countryIso].filter(Boolean);
}

// Plain, robust HTML: one column, system fonts, no images, no tracking.
function layout({ title, intro, blocks = [], button = null, footer }) {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f4f3ef;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3ef;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e2dfd8">
<tr><td style="padding:22px 28px;border-bottom:1px solid #e2dfd8;font-family:Georgia,serif;font-size:22px">Z <span style="color:#000091">Fa</span>shi<span style="color:#e1000f">on</span></td></tr>
<tr><td style="padding:28px">
<h1 style="font-family:Georgia,serif;font-weight:normal;font-size:24px;margin:0 0 14px">${esc(title)}</h1>
<p style="font-size:15px;line-height:1.6;margin:0 0 18px">${esc(intro)}</p>
${blocks.map((b) => (b.rows
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-top:1px solid #eee">${b.heading ? `<tr><td colspan="2" style="padding:12px 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#777">${esc(b.heading)}</td></tr>` : ''}${b.rows.map(([l, r, strong]) => `<tr><td style="padding:6px 0;font-size:14px;${strong ? 'font-weight:bold' : ''}">${esc(l)}</td><td align="right" style="padding:6px 0;font-size:14px;white-space:nowrap;${strong ? 'font-weight:bold' : ''}">${esc(r)}</td></tr>`).join('')}</table>`
    : `${b.heading ? `<p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#777;margin:0 0 4px">${esc(b.heading)}</p>` : ''}<p style="font-size:14px;line-height:1.6;margin:0 0 18px">${b.lines.map(esc).join('<br>')}</p>`)).join('\n')}
${button ? `<p style="margin:24px 0"><a href="${esc(button.href)}" style="background:#111;color:#fff;text-decoration:none;padding:12px 20px;font-size:14px;display:inline-block">${esc(button.label)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #e2dfd8;font-size:12px;line-height:1.5;color:#777">${esc(footer)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [title, '', intro, '',
    ...blocks.flatMap((b) => [...(b.heading ? [b.heading.toUpperCase()] : []), ...(b.rows ? b.rows.map(([l, r]) => `${l} : ${r}`) : b.lines), '']),
    ...(button ? [`${button.label} : ${button.href}`, ''] : []), '—', footer].join('\n');
  return { html, text };
}

const CLIENT_FOOTER = 'Z Fashion — la mode des boutiques indépendantes. Une question ? Répondez simplement à cet e-mail.';
const STORE_FOOTER = 'Z Fashion — espace Partner. Une question ? Répondez simplement à cet e-mail.';

/**
 * @param {object} a
 * @param {object} a.order    clientOrderView(): id, createdAt, items (name, brandName, size, quantity,
 *                            unitPriceMinorUnits, storeName, partnerId), stores, subtotal/shipping/total, shippingAddress
 * @param {string} a.siteUrl  e.g. https://zfashion.online
 */
function orderConfirmed({ order, siteUrl }) {
  const byStore = {};
  for (const l of order.items) (byStore[l.partnerId] = byStore[l.partnerId] || { name: l.storeName || 'Boutique', lines: [] }).lines.push(l);
  const blocks = Object.values(byStore).map((s) => ({
    heading: `Vendu et expédié par ${s.name}`,
    rows: s.lines.map((l) => [`${l.quantity} × ${lineLabel(l)}`, money(l.unitPriceMinorUnits * l.quantity)]),
  }));
  blocks.push({ rows: [['Sous-total', money(order.subtotalMinorUnits)], ['Livraison', order.shippingMinorUnits ? money(order.shippingMinorUnits) : 'Incluse'], ['Total TTC payé', money(order.totalMinorUnits), true]] });
  blocks.push({ heading: 'Livraison à', lines: addressLines(order.shippingAddress) });
  const n = Object.keys(byStore).length;
  const { html, text } = layout({
    title: 'Merci pour votre commande',
    intro: `Votre paiement est confirmé. Commande ${ref(order.id)} du ${date(order.createdAt)}. ${n > 1 ? `Chacune des ${n} boutiques prépare et expédie son colis séparément` : 'La boutique prépare et expédie votre colis'} ; vous le suivez dans votre compte.`,
    blocks: blocks.concat([{ lines: ['Vous disposez de 14 jours après réception pour retourner un article. Conditions générales de vente : ' + siteUrl + '/cgv'] }]),
    button: { label: 'Suivre ma commande', href: `${siteUrl}/compte/commandes/${encodeURIComponent(order.id)}` },
    footer: CLIENT_FOOTER,
  });
  return { subject: `Commande ${ref(order.id)} confirmée`, html, text };
}

/**
 * @param {object} a
 * @param {object} a.order       partnerOrderView(): id, createdAt, items (the store's lines), ticket, shippingAddress
 * @param {string} a.storeName
 * @param {string} a.consoleUrl  the Partner space
 */
function storeNewOrder({ order, storeName, consoleUrl }) {
  const rows = order.items.map((l) => [`${l.quantity} × ${lineLabel(l)}${l.sku ? ` [réf. ${l.sku}]` : ''}`, money(l.unitPriceMinorUnits * l.quantity)]);
  const t = order.ticket || {};
  rows.push(['Total payé par le client', money(t.subtotalMinorUnits), true]);
  if (t.commissionMinorUnits != null) rows.push([`Commission Z Fashion (${t.commissionRatePercent} %)`, '− ' + money(t.commissionMinorUnits)]);
  const { html, text } = layout({
    title: 'Nouvelle commande à expédier',
    intro: `${storeName || 'Votre boutique'} a reçu la commande ${ref(order.id)}, payée le ${date(order.createdAt)}. Merci de l’expédier dans les 3 jours ouvrés et d’indiquer le suivi dans votre espace Partner.`,
    blocks: [{ heading: 'Articles', rows }, { heading: 'Adresse de livraison', lines: addressLines(order.shippingAddress) }],
    button: consoleUrl ? { label: 'Ouvrir mon espace Partner', href: consoleUrl } : null,
    footer: STORE_FOOTER,
  });
  return { subject: `Nouvelle commande ${ref(order.id)} — à expédier`, html, text };
}

const DECISIONS = {
  under_review: { subject: 'Votre demande d’adhésion est en cours d’examen', title: 'Demande en cours d’examen', intro: 'Nous examinons la demande d’adhésion de {store}. Nous revenons vers vous rapidement.' },
  approved: { subject: 'Votre demande d’adhésion est acceptée', title: 'Bienvenue sur Z Fashion', intro: 'La demande d’adhésion de {store} est acceptée. Vous pouvez dès maintenant préparer votre catalogue et votre Corner dans votre espace Partner ; votre boutique sera visible des clients dès son activation.' },
  active: { subject: 'Votre boutique est active sur Z Fashion', title: 'Votre boutique est active', intro: '{store} est active : vos produits apparaissent sur le site dès leur validation par Z Fashion. Votre premier mois d’abonnement est offert ; pensez à mettre en place le paiement de l’abonnement et votre compte de versement dans votre espace.' },
  rejected: { subject: 'Votre demande d’adhésion', title: 'Votre demande d’adhésion', intro: 'Nous ne pouvons pas donner suite, pour l’instant, à la demande d’adhésion de {store}.' },
  suspended: { subject: 'Votre boutique est suspendue', title: 'Boutique suspendue', intro: '{store} est suspendue : ses produits ne sont plus visibles et ne peuvent plus être commandés. Les commandes en cours doivent être honorées.' },
};

/** @param {{ toStatus: string, storeName: string, note?: string, consoleUrl?: string }} a */
function applicationDecision({ toStatus, storeName, note, consoleUrl }) {
  const d = DECISIONS[toStatus];
  if (!d) return null;
  const blocks = note ? [{ heading: toStatus === 'rejected' || toStatus === 'suspended' ? 'Motif' : 'Message de Z Fashion', lines: [note] }] : [];
  if (toStatus === 'rejected' || toStatus === 'suspended') blocks.push({ lines: ['Vous pouvez nous répondre pour toute question ou pour contester cette décision.'] });
  const { html, text } = layout({
    title: d.title,
    intro: d.intro.replace('{store}', storeName || 'votre boutique'),
    blocks,
    button: consoleUrl && toStatus !== 'rejected' ? { label: 'Ouvrir mon espace Partner', href: consoleUrl } : null,
    footer: STORE_FOOTER,
  });
  return { subject: d.subject, html, text };
}

/** @param {{ productName: string, note: string, withdrawn: boolean, consoleUrl?: string }} a */
function productRefused({ productName, note, withdrawn, consoleUrl }) {
  const { html, text } = layout({
    title: withdrawn ? 'Produit retiré du site' : 'Produit non validé',
    intro: withdrawn
      ? `Le produit « ${productName} » a été retiré du site par Z Fashion.`
      : `Le produit « ${productName} » n’a pas été validé pour la mise en ligne.`,
    blocks: [{ heading: 'Motif', lines: [note] }, { lines: ['Corrigez le produit puis demandez une nouvelle validation depuis l’onglet Catalogue de votre espace.'] }],
    button: consoleUrl ? { label: 'Ouvrir mon catalogue', href: consoleUrl } : null,
    footer: STORE_FOOTER,
  });
  return { subject: withdrawn ? `Produit retiré : ${productName}` : `Produit non validé : ${productName}`, html, text };
}

/** Message from the contact form, to Z Fashion support (reply goes to the sender). */
function contactMessage({ name, email, orderRef, topic, message }) {
  const { html, text } = layout({
    title: 'Message reçu depuis le site',
    intro: `${name} (${email}) a écrit depuis la page Contact.`,
    blocks: [{ rows: [['Sujet', topic || '—'], ['Commande', orderRef || '—']] }, { heading: 'Message', lines: String(message).split(/\r?\n/) }],
    footer: 'Répondre à cet e-mail répond directement au client.',
  });
  return { subject: `[Contact] ${topic || 'Message'}${orderRef ? ` — ${orderRef}` : ''} — ${name}`, html, text };
}

function contactReceipt({ name, message }) {
  const { html, text } = layout({
    title: 'Nous avons bien reçu votre message',
    intro: `Bonjour ${name}, merci pour votre message. Nous vous répondons sous 48 heures ouvrées.`,
    blocks: [{ heading: 'Votre message', lines: String(message).split(/\r?\n/) }],
    footer: CLIENT_FOOTER,
  });
  return { subject: 'Votre message à Z Fashion', html, text };
}

module.exports = { orderConfirmed, storeNewOrder, applicationDecision, productRefused, contactMessage, contactReceipt, ref, esc };
