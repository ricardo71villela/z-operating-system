/* ============================================================
   Z FASHION — live checkout and customer orders (task 14)
   ============================================================
   Registered on the live layer (customer-live.js); inactive without
   an API address. Steps:

     /checkout             sign-in, then the browser bag is copied to
                           the server cart (PUT/DELETE /clients/:id/cart/
                           items/:productId); stock or price problems are
                           shown with a fix
     /checkout/livraison   choose or add a shipping address (France)
     /checkout/revision    summary per boutique, terms, "Commander et
                           payer" -> POST /clients/:id/checkout (stock
                           held 30 min, pending order)
     /checkout/paiement    Stripe Payment Element for that order
                           (POST /clients/:id/orders/:id/payment); card
                           data goes to Stripe only
     /checkout/confirmation?order=  waits for the Stripe webhook to mark
                           the order paid, then empties the bag
     /compte/commandes[/:id], /compte/adresses  real orders and addresses

   Calls carry the customer's session token (customer-auth.js). Every
   value from the API goes through esc().
   ============================================================ */

(() => {
  const LIVE = window.ZFashionLive;
  const STATE = window.ZFashionCustomerState;
  if (!LIVE || !LIVE.active) return;
  const { esc, money, lang, setTitle, toast } = LIVE.helpers;
  const API = LIVE.api;
  const page = document.getElementById('pageContent');
  const STRIPE_JS = 'https://js.stripe.com/v3/';
  const KEYS = { address: 'zfashion_checkout_address', order: 'zfashion_checkout_order' };

  const COPY = {
    fr: {
      steps: ['Identification', 'Livraison', 'Récapitulatif', 'Paiement', 'Confirmation'], yourOrder: 'Votre commande',
      loading: 'Chargement…', unavailable: 'Service momentanément indisponible. Réessayez dans un instant.', retry: 'Réessayer',
      signInTitle: 'Connectez-vous pour commander', signInCopy: 'Un code de connexion vous est envoyé par e-mail. Votre compte est créé à la première connexion ; votre panier est conservé.', signIn: 'Se connecter',
      signedAs: 'Connecté :', bagEmpty: 'Votre panier est vide', bagEmptyCopy: 'Ajoutez des pièces avant de commander.', shop: 'Voir les nouveautés',
      checking: 'Vérification du stock et des prix…', fixTitle: 'Quelques pièces ont changé', fixCopy: 'Corrigez ces lignes pour continuer.',
      lowStock: 'Il en reste {n}.', gone: 'Plus disponible.', setTo: 'Passer à {n}', remove: 'Retirer', continue: 'Continuer', back: 'Retour',
      deliveryTitle: 'Adresse de livraison', deliveryCopy: 'Livraison incluse en France métropolitaine. Chaque boutique expédie son colis séparément.',
      addAddress: 'Ajouter une adresse', newAddress: 'Nouvelle adresse', recipient: 'Nom du destinataire', line1: 'Adresse', line2: 'Complément (facultatif)', postal: 'Code postal', city: 'Ville', country: 'Pays', france: 'France',
      save: 'Enregistrer', cancel: 'Annuler', chooseAddress: 'Choisissez une adresse de livraison.', addressInvalid: 'Complétez le nom, l’adresse, le code postal (5 chiffres) et la ville.', defaultAddr: 'Par défaut',
      reviewTitle: 'Récapitulatif', shipTo: 'Livré à', terms: 'J’ai lu et j’accepte les {cgv} de Z Fashion et des boutiques.', cgv: 'conditions générales de vente', termsNeeded: 'Acceptez les conditions générales de vente.',
      orderPay: 'Commander et payer {total}', ordering: 'Création de la commande…', soldBy: 'Vendu par', delivery: 'Livraison', included: 'Incluse', subtotal: 'Sous-total', total: 'Total TTC',
      outOfStockNow: 'Une pièce vient d’être vendue entre-temps. Votre panier a été mis à jour.', addrMissing: 'Adresse introuvable ; choisissez-en une autre.',
      payTitle: 'Paiement sécurisé', payCopy: 'Le paiement est traité par Stripe. Z Fashion ne voit jamais vos données de carte.', pay: 'Payer {total}', paying: 'Paiement…',
      held: 'Vos pièces sont réservées jusqu’à {time}.', expired: 'Le délai de paiement est dépassé et les pièces ont été remises en vente. Recommencez depuis le panier.',
      payOff: 'Le paiement en ligne n’est pas encore ouvert. Réessayez plus tard.', payFailed: 'Le paiement n’a pas abouti :', backToBag: 'Retour au panier',
      waitTitle: 'Confirmation du paiement…', waitCopy: 'Cela prend quelques secondes.', thanksTitle: 'Merci pour votre commande', thanksCopy: 'Un e-mail de confirmation vous sera envoyé. Chaque boutique prépare et expédie ses pièces ; vous suivez chaque colis dans votre compte.',
      reference: 'Référence', seeOrder: 'Voir ma commande', keepShopping: 'Continuer mes achats', slowTitle: 'Paiement en cours de confirmation', slowCopy: 'Votre banque n’a pas encore confirmé le paiement. Votre commande apparaîtra dans votre compte dès la confirmation.',
      refused: 'Paiement refusé ou annulé', refusedCopy: 'Aucun montant n’a été débité. Vous pouvez réessayer avec un autre moyen de paiement.', tryAgain: 'Réessayer le paiement',
      ordersEmpty: 'Aucune commande pour l’instant', ordersEmptyCopy: 'Vos commandes apparaîtront ici.', order: 'Commande', placed: 'Passée le', items: 'articles', view: 'Voir',
      finishPay: 'Finaliser le paiement', parcels: 'Colis par boutique', notFound: 'Commande introuvable',
      st_pending_payment: 'En attente de paiement', st_paid: 'Payée', st_fulfilling: 'En préparation', st_fulfilled: 'Livrée', st_partially_refunded: 'Partiellement remboursée', st_refunded: 'Remboursée', st_cancelled: 'Annulée',
      sh_confirmed: 'Confirmé par la boutique', sh_preparing: 'En préparation', sh_shipped: 'Expédié', sh_delivered: 'Livré', sh_cancelled: 'Annulé', sh_none: 'En attente du paiement',
      addressesEmpty: 'Aucune adresse enregistrée', setDefault: 'Définir par défaut', saved: 'Adresse enregistrée.',
    },
    en: {
      steps: ['Sign in', 'Delivery', 'Summary', 'Payment', 'Confirmation'], yourOrder: 'Your order',
      loading: 'Loading…', unavailable: 'Service temporarily unavailable. Please try again shortly.', retry: 'Try again',
      signInTitle: 'Sign in to order', signInCopy: 'We e-mail you a sign-in code. Your account is created the first time; your bag is kept.', signIn: 'Sign in',
      signedAs: 'Signed in:', bagEmpty: 'Your bag is empty', bagEmptyCopy: 'Add pieces before checking out.', shop: 'See what’s new',
      checking: 'Checking stock and prices…', fixTitle: 'Some pieces changed', fixCopy: 'Fix these lines to continue.',
      lowStock: '{n} left.', gone: 'No longer available.', setTo: 'Change to {n}', remove: 'Remove', continue: 'Continue', back: 'Back',
      deliveryTitle: 'Delivery address', deliveryCopy: 'Delivery included in mainland France. Each boutique ships its own parcel.',
      addAddress: 'Add an address', newAddress: 'New address', recipient: 'Recipient name', line1: 'Address', line2: 'Address line 2 (optional)', postal: 'Postcode', city: 'City', country: 'Country', france: 'France',
      save: 'Save', cancel: 'Cancel', chooseAddress: 'Choose a delivery address.', addressInvalid: 'Fill in the name, address, postcode (5 digits) and city.', defaultAddr: 'Default',
      reviewTitle: 'Summary', shipTo: 'Delivered to', terms: 'I have read and accept the {cgv} of Z Fashion and the boutiques.', cgv: 'terms of sale', termsNeeded: 'Accept the terms of sale.',
      orderPay: 'Order and pay {total}', ordering: 'Creating your order…', soldBy: 'Sold by', delivery: 'Delivery', included: 'Included', subtotal: 'Subtotal', total: 'Total incl. VAT',
      outOfStockNow: 'A piece has just been sold. Your bag has been updated.', addrMissing: 'Address not found; choose another one.',
      payTitle: 'Secure payment', payCopy: 'Payment is processed by Stripe. Z Fashion never sees your card details.', pay: 'Pay {total}', paying: 'Paying…',
      held: 'Your pieces are reserved until {time}.', expired: 'The payment time ran out and the pieces were put back on sale. Start again from your bag.',
      payOff: 'Online payment is not open yet. Please try again later.', payFailed: 'The payment did not go through:', backToBag: 'Back to bag',
      waitTitle: 'Confirming your payment…', waitCopy: 'This takes a few seconds.', thanksTitle: 'Thank you for your order', thanksCopy: 'A confirmation e-mail will follow. Each boutique prepares and ships its pieces; track every parcel in your account.',
      reference: 'Reference', seeOrder: 'See my order', keepShopping: 'Continue shopping', slowTitle: 'Payment being confirmed', slowCopy: 'Your bank has not confirmed the payment yet. Your order will appear in your account as soon as it does.',
      refused: 'Payment declined or cancelled', refusedCopy: 'Nothing was charged. You can try again with another payment method.', tryAgain: 'Try the payment again',
      ordersEmpty: 'No orders yet', ordersEmptyCopy: 'Your orders will appear here.', order: 'Order', placed: 'Placed on', items: 'items', view: 'View',
      finishPay: 'Complete payment', parcels: 'Parcels by boutique', notFound: 'Order not found',
      st_pending_payment: 'Awaiting payment', st_paid: 'Paid', st_fulfilling: 'Being prepared', st_fulfilled: 'Delivered', st_partially_refunded: 'Partly refunded', st_refunded: 'Refunded', st_cancelled: 'Cancelled',
      sh_confirmed: 'Confirmed by the boutique', sh_preparing: 'Being prepared', sh_shipped: 'Shipped', sh_delivered: 'Delivered', sh_cancelled: 'Cancelled', sh_none: 'Awaiting payment',
      addressesEmpty: 'No saved address', setDefault: 'Make default', saved: 'Address saved.',
    },
  };
  const c = (key, vars) => {
    let s = COPY[lang()][key] != null ? COPY[lang()][key] : COPY.fr[key];
    if (vars && typeof s === 'string') Object.keys(vars).forEach((k) => { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  };
  const ref = (id) => 'ZF-' + String(id || '').slice(0, 8).toUpperCase();
  const dateFmt = (iso, withTime) => new Date(iso).toLocaleString(lang() === 'fr' ? 'fr-FR' : 'en-GB', withTime ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'long', year: 'numeric' });
  const store = (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (_) {} };
  const stored = (k) => { try { return sessionStorage.getItem(k); } catch (_) { return null; } };

  // ---------- session and API

  function session() {
    const ready = window.ZFashionCustomerAuth
      ? Promise.resolve(window.ZFashionCustomerAuth)
      : new Promise((resolve) => document.addEventListener('DOMContentLoaded', () => resolve(window.ZFashionCustomerAuth)));
    return ready.then((auth) => (auth ? auth.getSession() : null)).catch(() => null);
  }
  async function api(s, method, path, body) {
    const res = await fetch(API + '/clients/' + encodeURIComponent(s.user.id) + path, {
      method,
      headers: { Authorization: 'Bearer ' + s.access_token, accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = {};
    try { json = await res.json(); } catch (_) { /* empty */ }
    return { ok: res.ok, status: res.status, body: json };
  }

  // ---------- layout pieces

  const STEP_PATHS = ['/checkout', '/checkout/livraison', '/checkout/revision', '/checkout/paiement', '/checkout/confirmation'];
  const progress = (n) => `<nav class="checkout-progress" aria-label="Commande">${c('steps').map((label, i) => `<a ${i < n ? `href="${STEP_PATHS[i]}"` : ''} ${i === n ? 'aria-current="step"' : ''}><span>${String(i + 1).padStart(2, '0')}</span><strong>${esc(label)}</strong></a>`).join('')}</nav>`;
  const message = (title, copy, actions = '') => `<div class="commerce-empty"><h2>${esc(title)}</h2>${copy ? `<p>${esc(copy)}</p>` : ''}${actions}</div>`;
  const loadingBlock = (text) => `<p class="zf-live-loading">${esc(text || c('loading'))}</p>`;
  const failBlock = () => message(c('unavailable'), '', `<button class="route-button secondary" type="button" data-co-retry>${esc(c('retry'))}</button>`);
  function wireRetry() { page.querySelectorAll('[data-co-retry]').forEach((b) => b.addEventListener('click', () => LIVE.render())); }
  const lineName = (l) => (l.name || '—') + (l.size || l.format ? ' · ' + LIVE.helpers.sizeLabel(l) : '');

  /** Summary aside for a cart or an order (stores, lines, totals). */
  function summary(data) {
    const lines = data.lines || data.items || [];
    return `<aside class="checkout-summary"><p class="eyebrow">Z FASHION</p><h3>${esc(c('yourOrder'))}</h3>
      <div class="checkout-summary-lines">${lines.map((l) => `<div class="checkout-summary-line">${LIVE.helpers.safeUrl(l.imageUrl) ? `<img src="${esc(l.imageUrl)}" alt="">` : '<span class="zf-live-noimg" aria-hidden="true">Z</span>'}
        <div><strong>${esc(l.name || '—')}</strong><small>${esc(l.storeName || '')}${LIVE.helpers.sizeLabel(l) ? ' · ' + esc(LIVE.helpers.sizeLabel(l)) : ''} · ×${esc(l.quantity)}</small></div><span>${esc(money(l.lineTotalMinorUnits))}</span></div>`).join('')}</div>
      <dl><div><dt>${esc(c('subtotal'))}</dt><dd>${esc(money(data.subtotalMinorUnits))}</dd></div>
      <div><dt>${esc(c('delivery'))}</dt><dd>${data.shippingMinorUnits ? esc(money(data.shippingMinorUnits)) : esc(c('included'))}</dd></div>
      <div class="checkout-total"><dt>${esc(c('total'))}</dt><dd>${esc(money(data.totalMinorUnits))}</dd></div></dl></aside>`;
  }
  const layout = (n, body, aside) => `${progress(n)}<div class="checkout-layout"><section class="checkout-stage">${body}</section>${aside || ''}</div>`;

  async function requireSession(step) {
    const s = await session();
    if (s && s.user) return s;
    page.innerHTML = layout(0, `<h2>${esc(c('signInTitle'))}</h2><p>${esc(c('signInCopy'))}</p>
      <a class="route-button" href="/connexion?next=${encodeURIComponent(STEP_PATHS[step] || '/checkout')}">${esc(c('signIn'))}</a>`);
    return null;
  }

  // ---------- 1. identification + cart sync

  /** Copies the browser bag to the server cart; returns the server cart and problems found. */
  async function syncCart(s) {
    const bag = STATE.snapshot().bag;
    const want = new Map();
    for (const item of bag) want.set(item.productId, Math.min(10, (want.get(item.productId) || 0) + item.qty));
    const current = await api(s, 'GET', '/cart');
    if (!current.ok) throw new Error('cart');
    const problems = [];
    for (const line of current.body.cart.lines) {
      if (!want.has(line.productId)) await api(s, 'DELETE', '/cart/items/' + encodeURIComponent(line.productId));
    }
    for (const [productId, quantity] of want) {
      const have = current.body.cart.lines.find((l) => l.productId === productId);
      if (have && have.quantity === quantity && have.status === 'ok') continue;
      const r = await api(s, 'PUT', '/cart/items/' + encodeURIComponent(productId), { quantity });
      if (!r.ok) {
        if (r.status === 409 || r.status === 422) problems.push({ productId, error: r.body.error, sellable: r.body.sellable });
        else throw new Error('cart ' + r.status);
      }
    }
    const cart = await api(s, 'GET', '/cart');
    if (!cart.ok) throw new Error('cart');
    for (const line of cart.body.cart.lines) {
      if (line.status !== 'ok' && !problems.some((p) => p.productId === line.productId)) {
        problems.push({ productId: line.productId, error: line.status, sellable: line.sellableQuantity });
      }
    }
    return { cart: cart.body.cart, problems };
  }

  function fixLine(productId, qty) {
    const items = STATE.snapshot().bag.filter((i) => i.productId === productId);
    items.forEach((i, n) => (n === 0 && qty > 0 ? STATE.setBagQty(productId, i.size, qty) : STATE.removeBag(productId, i.size)));
  }

  async function renderIdentify() {
    setTitle(c('steps')[0]);
    if (!STATE.snapshot().bag.length) { page.innerHTML = message(c('bagEmpty'), c('bagEmptyCopy'), `<a class="route-button secondary" href="/nouveautes">${esc(c('shop'))}</a>`); return; }
    const s = await requireSession(0);
    if (!s) return;
    page.innerHTML = layout(0, loadingBlock(c('checking')));
    let result;
    try { result = await syncCart(s); } catch (_) { page.innerHTML = failBlock(); wireRetry(); return; }
    const catalogue = LIVE.catalogue();
    const label = (id) => {
      const fromCart = result.cart.lines.find((l) => l.productId === id);
      const p = catalogue && catalogue.byId.get(id);
      return (fromCart && fromCart.name) || (p && LIVE.helpers.name(p)) || '—';
    };
    const who = `<p class="zf-co-who">${esc(c('signedAs'))} <strong>${esc(s.user.email || '')}</strong></p>`;
    if (result.problems.length) {
      page.innerHTML = layout(0, `${who}<h2>${esc(c('fixTitle'))}</h2><p>${esc(c('fixCopy'))}</p><ul class="zf-co-problems">${result.problems.map((p) => {
        const n = Number(p.sellable) || 0;
        const can = p.error === 'insufficient_stock' && n > 0;
        return `<li><strong>${esc(label(p.productId))}</strong><span>${esc(can ? c('lowStock', { n }) : c('gone'))}</span>
          ${can ? `<button class="route-button secondary" type="button" data-fix="${esc(p.productId)}" data-qty="${esc(Math.min(n, 10))}">${esc(c('setTo', { n: Math.min(n, 10) }))}</button>` : ''}
          <button class="route-button secondary" type="button" data-fix="${esc(p.productId)}" data-qty="0">${esc(c('remove'))}</button></li>`;
      }).join('')}</ul><a class="route-button secondary" href="/panier">← ${esc(c('back'))}</a>`);
      page.querySelectorAll('[data-fix]').forEach((b) => b.addEventListener('click', () => { fixLine(b.dataset.fix, Number(b.dataset.qty)); LIVE.render(); }));
      return;
    }
    page.innerHTML = layout(0, `${who}<h2>${esc(c('steps')[0])}</h2><p>${esc(c('signInCopy').split('.')[0])}.</p>
      <div class="completion-nav"><a class="route-button secondary" href="/panier">← ${esc(c('back'))}</a><a class="route-button" href="/checkout/livraison">${esc(c('continue'))} →</a></div>`, summary(result.cart));
  }

  // ---------- 2. delivery address

  async function renderDelivery() {
    setTitle(c('steps')[1]);
    const s = await requireSession(1);
    if (!s) return;
    page.innerHTML = layout(1, loadingBlock());
    const [addrRes, cartRes] = await Promise.all([api(s, 'GET', '/addresses'), api(s, 'GET', '/cart')]).catch(() => [{ ok: false }, { ok: false }]);
    if (!addrRes.ok || !cartRes.ok) { page.innerHTML = failBlock(); wireRetry(); return; }
    const cart = cartRes.body.cart;
    if (!cart.lines.length) { location.assign('/checkout'); return; }
    const countries = cart.shippingCountries || ['FR'];
    const addresses = addrRes.body.addresses.filter((a) => a.type === 'shipping' && countries.includes(a.countryIso));
    let selected = stored(KEYS.address);
    if (!addresses.some((a) => a.id === selected)) selected = (addresses.find((a) => a.isDefault) || addresses[0] || {}).id || null;
    const card = (a) => `<label class="zf-co-address"><input type="radio" name="address" value="${esc(a.id)}" ${a.id === selected ? 'checked' : ''}>
      <span><strong>${esc(a.recipientName || '')}</strong>${a.isDefault ? ` <em>${esc(c('defaultAddr'))}</em>` : ''}<br>${esc(a.line1)}${a.line2 ? '<br>' + esc(a.line2) : ''}<br>${esc(a.postalCode)} ${esc(a.city)} · ${esc(a.countryIso === 'FR' ? c('france') : a.countryIso)}</span></label>`;
    page.innerHTML = layout(1, `<h2>${esc(c('deliveryTitle'))}</h2><p>${esc(c('deliveryCopy'))}</p>
      <div class="zf-co-addresses">${addresses.map(card).join('')}</div>
      <p class="zf-co-error" role="alert" hidden></p>
      ${addressForm(!addresses.length)}
      <div class="completion-nav"><a class="route-button secondary" href="/checkout">← ${esc(c('back'))}</a><button class="route-button" type="button" id="coToReview">${esc(c('continue'))} →</button></div>`, summary(cart));
    wireAddressForm(s, () => LIVE.render());
    document.getElementById('coToReview').addEventListener('click', () => {
      const chosen = page.querySelector('input[name=address]:checked');
      if (!chosen) { showError(c('chooseAddress')); return; }
      store(KEYS.address, chosen.value);
      location.assign('/checkout/revision');
    });
  }

  function addressForm(open) {
    return `<details class="zf-co-new" ${open ? 'open' : ''}><summary>${esc(c('addAddress'))}</summary>
      <form class="completion-form" id="coAddressForm" novalidate>
        <label>${esc(c('recipient'))}<input name="recipientName" autocomplete="name" required maxlength="120"></label>
        <label>${esc(c('line1'))}<input name="line1" autocomplete="address-line1" required maxlength="200"></label>
        <label>${esc(c('line2'))}<input name="line2" autocomplete="address-line2" maxlength="200"></label>
        <div class="completion-two"><label>${esc(c('postal'))}<input name="postalCode" autocomplete="postal-code" inputmode="numeric" required maxlength="5"></label>
        <label>${esc(c('city'))}<input name="city" autocomplete="address-level2" required maxlength="120"></label></div>
        <label>${esc(c('country'))}<select name="countryIso"><option value="FR">${esc(c('france'))}</option></select></label>
        <button class="route-button secondary" type="submit">${esc(c('save'))}</button></form></details>`;
  }
  function showError(text) {
    const box = page.querySelector('.zf-co-error');
    if (box) { box.textContent = text; box.hidden = !text; } else if (text) toast(text);
  }
  function wireAddressForm(s, after) {
    const form = document.getElementById('coAddressForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form).entries());
      Object.keys(f).forEach((k) => { f[k] = String(f[k] || '').trim(); });
      if (!f.recipientName || !f.line1 || !/^\d{5}$/.test(f.postalCode) || !f.city) { showError(c('addressInvalid')); return; }
      const button = form.querySelector('button[type=submit]'); button.disabled = true;
      const r = await api(s, 'POST', '/addresses', { type: 'shipping', recipientName: f.recipientName, line1: f.line1, line2: f.line2 || undefined, postalCode: f.postalCode, city: f.city, countryIso: f.countryIso || 'FR', isDefault: !page.querySelector('input[name=address]') }).catch(() => ({ ok: false }));
      button.disabled = false;
      if (!r.ok) { showError(c('addressInvalid')); return; }
      store(KEYS.address, r.body.address.id);
      toast(c('saved'));
      after();
    });
  }

  // ---------- 3. review and order

  async function renderReview() {
    setTitle(c('steps')[2]);
    const s = await requireSession(2);
    if (!s) return;
    const addressId = stored(KEYS.address);
    if (!addressId) { location.assign('/checkout/livraison'); return; }
    page.innerHTML = layout(2, loadingBlock());
    const [addrRes, cartRes] = await Promise.all([api(s, 'GET', '/addresses'), api(s, 'GET', '/cart')]).catch(() => [{ ok: false }, { ok: false }]);
    if (!addrRes.ok || !cartRes.ok) { page.innerHTML = failBlock(); wireRetry(); return; }
    const cart = cartRes.body.cart;
    const address = addrRes.body.addresses.find((a) => a.id === addressId);
    if (!cart.lines.length) { location.assign('/checkout'); return; }
    if (!address) { store(KEYS.address, null); location.assign('/checkout/livraison'); return; }
    if (!cart.canCheckout) { location.assign('/checkout'); return; }
    const byStore = cart.stores.map((st) => `<div class="zf-co-store"><p class="eyebrow">${esc(c('soldBy'))} ${esc(st.storeName || '')}</p>
      ${cart.lines.filter((l) => l.partnerId === st.partnerId).map((l) => `<div class="zf-co-line"><span>${esc(l.name || '')}${LIVE.helpers.sizeLabel(l) ? ' · ' + esc(LIVE.helpers.sizeLabel(l)) : ''} ×${esc(l.quantity)}</span><strong>${esc(money(l.lineTotalMinorUnits))}</strong></div>`).join('')}</div>`).join('');
    page.innerHTML = layout(2, `<h2>${esc(c('reviewTitle'))}</h2>${byStore}
      <div class="review-grid"><div><small>${esc(c('shipTo'))}</small><strong>${esc(address.recipientName || '')}<br>${esc(address.line1)}${address.line2 ? ', ' + esc(address.line2) : ''}<br>${esc(address.postalCode)} ${esc(address.city)}</strong></div>
        <div><small>${esc(c('delivery'))}</small><strong>${esc(c('included'))}</strong></div></div>
      <label class="review-consent"><input type="checkbox" id="coTerms"> <span>${esc(c('terms')).replace('{cgv}', `<a href="/cgv" target="_blank" rel="noopener">${esc(c('cgv'))}</a>`)}</span></label>
      <p class="zf-co-error" role="alert" hidden></p>
      <div class="completion-nav"><a class="route-button secondary" href="/checkout/livraison">← ${esc(c('back'))}</a>
      <button class="route-button" type="button" id="coOrder">${esc(c('orderPay', { total: money(cart.totalMinorUnits) }))}</button></div>`, summary(cart));
    document.getElementById('coOrder').addEventListener('click', async (e) => {
      if (!document.getElementById('coTerms').checked) { showError(c('termsNeeded')); return; }
      const button = e.currentTarget; button.disabled = true; button.textContent = c('ordering');
      const r = await api(s, 'POST', '/checkout', { addressId }).catch(() => ({ ok: false, status: 0, body: {} }));
      if (r.ok) { store(KEYS.order, r.body.order.id); location.assign('/checkout/paiement?order=' + encodeURIComponent(r.body.order.id)); return; }
      button.disabled = false; button.textContent = c('orderPay', { total: money(cart.totalMinorUnits) });
      if (r.body && (r.body.error === 'insufficient_stock' || r.body.error === 'product_unavailable')) {
        if (r.body.productId) fixLine(r.body.productId, Number(r.body.sellable) || 0);
        toast(c('outOfStockNow')); location.assign('/checkout'); return;
      }
      if (r.body && (r.body.error === 'address_not_found' || r.body.error === 'shipping_country_not_served')) { store(KEYS.address, null); showError(c('addrMissing')); return; }
      showError(c('unavailable'));
    });
  }

  // ---------- 4. payment (Stripe Payment Element)

  let stripeLoading = null;
  function loadStripe() {
    if (window.Stripe) return Promise.resolve(window.Stripe);
    if (!stripeLoading) {
      stripeLoading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = STRIPE_JS; s.async = true;
        s.onload = () => (window.Stripe ? resolve(window.Stripe) : reject(new Error('stripe')));
        s.onerror = () => { stripeLoading = null; reject(new Error('stripe')); };
        document.head.appendChild(s);
      });
    }
    return stripeLoading;
  }
  const orderIdFromUrl = () => new URLSearchParams(location.search).get('order') || stored(KEYS.order);

  async function renderPayment() {
    setTitle(c('steps')[3]);
    const s = await requireSession(3);
    if (!s) return;
    const orderId = orderIdFromUrl();
    if (!orderId) { location.assign('/panier'); return; }
    page.innerHTML = layout(3, loadingBlock());
    const orderRes = await api(s, 'GET', '/orders/' + encodeURIComponent(orderId)).catch(() => ({ ok: false }));
    if (!orderRes.ok) { page.innerHTML = orderRes.status === 404 ? message(c('notFound'), '', `<a class="route-button secondary" href="/panier">${esc(c('backToBag'))}</a>`) : failBlock(); wireRetry(); return; }
    const order = orderRes.body.order;
    if (order.status !== 'pending_payment') {
      if (order.status === 'cancelled') { page.innerHTML = layout(3, `<h2>${esc(c('steps')[3])}</h2><p>${esc(c('expired'))}</p><a class="route-button" href="/panier">${esc(c('backToBag'))}</a>`); return; }
      location.assign('/checkout/confirmation?order=' + encodeURIComponent(order.id)); return;
    }
    const payRes = await api(s, 'POST', '/orders/' + encodeURIComponent(orderId) + '/payment').catch(() => ({ ok: false, status: 0, body: {} }));
    if (!payRes.ok) {
      const text = payRes.status === 503 ? c('payOff') : payRes.body && payRes.body.error === 'order_not_payable' ? c('expired') : c('unavailable');
      page.innerHTML = layout(3, `<h2>${esc(c('payTitle'))}</h2><p>${esc(text)}</p><a class="route-button secondary" href="/panier">${esc(c('backToBag'))}</a>`, summary(order));
      return;
    }
    const pay = payRes.body.payment;
    page.innerHTML = layout(3, `<h2>${esc(c('payTitle'))}</h2><p>${esc(c('payCopy'))}</p>
      <p class="zf-co-held">${esc(c('held', { time: dateFmt(pay.expiresAt, true) }))}</p>
      <form id="coPayForm"><div id="coPaymentElement" class="zf-co-element"></div>
      <p class="zf-co-error" role="alert" hidden></p>
      <div class="completion-nav"><a class="route-button secondary" href="/checkout/revision">← ${esc(c('back'))}</a><button class="route-button" type="submit" id="coPay" disabled>${esc(c('pay', { total: money(pay.amountMinorUnits) }))}</button></div></form>`, summary(order));
    let stripe, elements;
    try {
      const Stripe = await loadStripe();
      stripe = Stripe(pay.publishableKey, { locale: lang() === 'fr' ? 'fr' : 'en' });
      elements = stripe.elements({ clientSecret: pay.clientSecret, appearance: { theme: 'stripe', variables: { colorPrimary: '#111111', borderRadius: '0px', fontFamily: 'system-ui, sans-serif' } } });
      const element = elements.create('payment', { layout: 'tabs' });
      element.mount('#coPaymentElement');
      element.on('ready', () => { document.getElementById('coPay').disabled = false; });
    } catch (_) { showError(c('unavailable')); return; }
    document.getElementById('coPayForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const button = document.getElementById('coPay'); button.disabled = true; button.textContent = c('paying');
      showError('');
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: location.origin + '/checkout/confirmation?order=' + encodeURIComponent(orderId) },
      });
      // Only reached when the payment could not start (otherwise Stripe redirects).
      button.disabled = false; button.textContent = c('pay', { total: money(pay.amountMinorUnits) });
      showError(c('payFailed') + ' ' + ((error && error.message) || ''));
    });
  }

  // ---------- 5. confirmation

  async function renderConfirmation() {
    setTitle(c('steps')[4]);
    const s = await requireSession(4);
    if (!s) return;
    const params = new URLSearchParams(location.search);
    const orderId = params.get('order') || stored(KEYS.order);
    if (!orderId) { location.assign('/compte/commandes'); return; }
    if (params.get('redirect_status') === 'failed') {
      page.innerHTML = layout(4, `<h2>${esc(c('refused'))}</h2><p>${esc(c('refusedCopy'))}</p><a class="route-button" href="/checkout/paiement?order=${encodeURIComponent(orderId)}">${esc(c('tryAgain'))}</a>`);
      return;
    }
    page.innerHTML = layout(4, `<h2>${esc(c('waitTitle'))}</h2><p>${esc(c('waitCopy'))}</p>`);
    let order = null;
    for (let i = 0; i < 15; i += 1) {
      const r = await api(s, 'GET', '/orders/' + encodeURIComponent(orderId)).catch(() => ({ ok: false }));
      if (r.ok) {
        order = r.body.order;
        if (order.status !== 'pending_payment') break;
        if (order.paymentStatus === 'failed') break;
      }
      await new Promise((res) => setTimeout(res, i < 5 ? 1000 : 2000));
    }
    if (order && order.paymentStatus === 'failed') {
      page.innerHTML = layout(4, `<h2>${esc(c('refused'))}</h2><p>${esc(c('refusedCopy'))}</p><a class="route-button" href="/checkout/paiement?order=${encodeURIComponent(orderId)}">${esc(c('tryAgain'))}</a>`);
      return;
    }
    const paid = order && ['paid', 'fulfilling', 'fulfilled'].includes(order.status);
    if (paid) { STATE.clearBag(); store(KEYS.order, null); store(KEYS.address, null); }
    page.innerHTML = layout(4, `<div class="completion-success"><span class="success-mark">✓</span><h2>${esc(paid ? c('thanksTitle') : c('slowTitle'))}</h2>
      <p>${esc(paid ? c('thanksCopy') : c('slowCopy'))}</p>
      <div class="confirmation-ref"><small>${esc(c('reference'))}</small><strong>${esc(ref(orderId))}</strong></div>
      <div class="completion-nav"><a class="route-button" href="/compte/commandes/${encodeURIComponent(orderId)}">${esc(c('seeOrder'))}</a><a class="route-button secondary" href="/nouveautes">${esc(c('keepShopping'))}</a></div></div>`, order ? summary(order) : '');
  }

  // ---------- account: orders and addresses

  const statusBadge = (o) => `<span class="order-status">${esc(c('st_' + o.status))}</span>`;

  async function renderOrders() {
    const s = await session();
    if (!s) return; // customer-auth.js redirects to /connexion
    page.innerHTML = loadingBlock();
    const r = await api(s, 'GET', '/orders').catch(() => ({ ok: false }));
    if (!r.ok) { page.innerHTML = failBlock(); wireRetry(); return; }
    const orders = r.body.orders.filter((o) => o.status !== 'cancelled' || o.paymentStatus === 'refunded');
    if (!orders.length) { page.innerHTML = message(c('ordersEmpty'), c('ordersEmptyCopy'), `<a class="route-button secondary" href="/nouveautes">${esc(c('shop'))}</a>`); return; }
    page.innerHTML = `<div class="orders-list">${orders.map((o) => `<article class="order-card"><div><div class="order-card-header"><h2>${esc(ref(o.id))}</h2>${statusBadge(o)}</div>
      <p class="order-meta">${esc(c('placed'))} ${esc(dateFmt(o.createdAt))} · ${esc(o.items.reduce((n, i) => n + i.quantity, 0))} ${esc(c('items'))} · ${esc(o.stores.map((st) => st.storeName).filter(Boolean).join(', '))}</p></div>
      <div><strong>${esc(money(o.totalMinorUnits))}</strong> <a class="route-button secondary" href="/compte/commandes/${encodeURIComponent(o.id)}">${esc(c('view'))}</a></div></article>`).join('')}</div>`;
  }

  async function renderOrder() {
    const s = await session();
    if (!s) return;
    const id = decodeURIComponent(location.pathname.split('/').filter(Boolean).at(-1) || '');
    setTitle(ref(id));
    page.innerHTML = loadingBlock();
    const r = await api(s, 'GET', '/orders/' + encodeURIComponent(id)).catch(() => ({ ok: false }));
    if (!r.ok) { page.innerHTML = r.status === 404 ? message(c('notFound'), '', `<a class="route-button secondary" href="/compte/commandes">${esc(c('back'))}</a>`) : failBlock(); wireRetry(); return; }
    const o = r.body.order;
    const a = o.shippingAddress || {};
    const payable = o.status === 'pending_payment' && o.paymentExpiresAt && new Date(o.paymentExpiresAt) > new Date();
    page.innerHTML = `<div class="order-detail"><div class="order-card-header"><h2>${esc(ref(o.id))}</h2>${statusBadge(o)}</div>
      <p class="order-meta">${esc(c('placed'))} ${esc(dateFmt(o.createdAt))}</p>
      ${payable ? `<p><a class="route-button" href="/checkout/paiement?order=${encodeURIComponent(o.id)}">${esc(c('finishPay'))}</a></p>` : ''}
      <h3>${esc(c('parcels'))}</h3>
      ${o.stores.map((st) => `<div class="zf-co-store"><p class="eyebrow">${esc(c('soldBy'))} ${esc(st.storeName || '')} · ${esc(c(st.shipmentStatus ? 'sh_' + st.shipmentStatus : 'sh_none'))}</p>
        ${o.items.filter((l) => l.partnerId === st.partnerId).map((l) => `<div class="zf-co-line"><span>${esc(l.name || '')}${LIVE.helpers.sizeLabel(l) ? ' · ' + esc(LIVE.helpers.sizeLabel(l)) : ''} ×${esc(l.quantity)}</span><strong>${esc(money(l.lineTotalMinorUnits))}</strong></div>`).join('')}</div>`).join('')}
      <div class="review-grid"><div><small>${esc(c('shipTo'))}</small><strong>${esc(a.recipientName || '')}<br>${esc(a.line1 || '')}${a.line2 ? ', ' + esc(a.line2) : ''}<br>${esc(a.postalCode || '')} ${esc(a.city || '')}</strong></div>
      <div><small>${esc(c('total'))}</small><strong>${esc(money(o.totalMinorUnits))}</strong></div></div></div>`;
  }

  async function renderAddresses() {
    const s = await session();
    if (!s) return;
    page.innerHTML = loadingBlock();
    const r = await api(s, 'GET', '/addresses').catch(() => ({ ok: false }));
    if (!r.ok) { page.innerHTML = failBlock(); wireRetry(); return; }
    const list = r.body.addresses.filter((a) => a.type === 'shipping');
    page.innerHTML = `<div class="address-grid">${list.length ? list.map((a) => `<article class="address-card">${a.isDefault ? `<span class="address-badge">${esc(c('defaultAddr'))}</span>` : ''}
        <p><strong>${esc(a.recipientName || '')}</strong><br>${esc(a.line1)}${a.line2 ? '<br>' + esc(a.line2) : ''}<br>${esc(a.postalCode)} ${esc(a.city)}</p>
        ${a.isDefault ? '' : `<button class="route-button secondary" type="button" data-default="${esc(a.id)}">${esc(c('setDefault'))}</button>`}</article>`).join('') : `<p>${esc(c('addressesEmpty'))}</p>`}</div>
      <p class="zf-co-error" role="alert" hidden></p>${addressForm(!list.length)}`;
    page.querySelectorAll('[data-default]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      await api(s, 'POST', '/addresses/' + encodeURIComponent(b.dataset.default) + '/set-default').catch(() => null);
      LIVE.render();
    }));
    wireAddressForm(s, () => LIVE.render());
  }

  // ---------- styles and registration

  const style = document.createElement('style');
  style.textContent = [
    '.zf-co-who{font-size:14px;margin:0 0 16px}',
    '.zf-co-problems{list-style:none;padding:0;margin:16px 0;display:grid;gap:10px}',
    '.zf-co-problems li{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;padding:12px 0;border-bottom:1px solid var(--zf-line,#ddd)}',
    '.zf-co-problems li span{color:#8a1c1c;font-size:14px}',
    '.zf-co-addresses{display:grid;gap:10px;margin:16px 0}',
    '.zf-co-address{display:flex;gap:12px;align-items:flex-start;padding:14px;border:1px solid var(--zf-line,#ddd);cursor:pointer;line-height:1.5}',
    '.zf-co-address:has(input:checked){border-color:currentColor}',
    '.zf-co-address em{font-style:normal;font-size:12px;opacity:.7}',
    '.zf-co-new{margin:12px 0 20px}.zf-co-new summary{cursor:pointer;text-decoration:underline;margin-bottom:12px}',
    '.zf-co-error{color:#8a1c1c;background:#fbeaea;padding:10px 12px;margin:12px 0}',
    '.zf-co-store{border-top:1px solid var(--zf-line,#ddd);padding:12px 0}',
    '.zf-co-line{display:flex;justify-content:space-between;gap:12px;padding:4px 0;font-size:14px}',
    '.zf-co-held{font-size:14px;background:#f1efeb;padding:10px 12px}',
    '.zf-co-element{margin:16px 0;min-height:120px}',
    '.review-consent a{text-decoration:underline}',
    '.zf-checkout #pageActions{display:none!important}',
  ].join('\n');
  document.head.appendChild(style);

  const routes = {
    checkoutIdentify: renderIdentify, checkoutDelivery: renderDelivery, checkoutReview: renderReview,
    checkoutPayment: renderPayment, checkoutConfirmation: renderConfirmation,
    orders: renderOrders, order: renderOrder, addresses: renderAddresses,
  };
  const CHECKOUT_IDS = ['checkoutIdentify', 'checkoutDelivery', 'checkoutReview', 'checkoutPayment', 'checkoutConfirmation'];
  Object.keys(routes).forEach((id) => LIVE.register(id, () => {
    routes[id]().catch(() => { page.innerHTML = failBlock(); wireRetry(); });
  }, { needsCatalogue: id === 'checkoutIdentify' }));
  if (LIVE.route && CHECKOUT_IDS.includes(LIVE.route.id)) document.documentElement.classList.add('zf-checkout');
  window.Z_FASHION_LIVE_CHECKOUT = 'LIVE';
})();
