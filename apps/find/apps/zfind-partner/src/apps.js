/* ============================================================
   Z FIND PARTNER — « Z Desk » et « Z Studio » (inclus dans l'offre)
   ============================================================
   Deux boutons dans l'en-tête de chaque vue. Un clic ouvre l'app dans
   un nouvel onglet, déjà connectée avec le même compte : le serveur
   (zfind.online/api/billing/app-link) vérifie la session de l'agence et
   renvoie un lien de connexion à usage unique. La session Partner n'est
   jamais transmise.
   ============================================================ */

const PAPPS = {
  desk: { label: 'Z Desk', title: 'Demandes, visites et agenda de l’agence' },
  studio: { label: 'Z Studio', title: 'Créer les visuels et posts de vos annonces' }
};
const PAPPS_ERRORS = {
  partner_not_active: 'Z Desk et Z Studio s’ouvrent dès que votre agence est validée.',
  unauthorized: 'Votre session a expiré : reconnectez-vous.',
  rate_limited: 'Trop de demandes : réessayez dans une minute.',
  network: 'Connexion impossible. Vérifiez votre réseau et réessayez.'
};

function pappsMount() {
  document.querySelectorAll('.dash-header .who').forEach(who => {
    if (who.querySelector('.papps')) return;
    const box = document.createElement('span');
    box.className = 'papps';
    box.innerHTML = Object.keys(PAPPS).map(k =>
      `<button type="button" class="papps-btn" data-app="${k}" title="${PAPPS[k].title}">${PAPPS[k].label} <span aria-hidden="true">↗</span></button>`
    ).join('');
    box.querySelectorAll('.papps-btn').forEach(b => b.addEventListener('click', () => pappsOpen(b.dataset.app, b)));
    who.insertBefore(box, who.firstChild);
  });
}

function pappsToast(message) {
  let t = document.getElementById('papps-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'papps-toast';
    t.className = 'papps-toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(pappsToast._timer);
  pappsToast._timer = setTimeout(() => t.classList.remove('show'), 6000);
}

async function pappsOpen(app, btn) {
  if (!PAPPS[app]) return;
  // Opened synchronously with the click (no pop-up blocker), filled once the link is ready.
  const win = window.open('', '_blank');
  if (win) {
    try { win.opener = null; } catch (_) { /* ignore */ }
    try { win.document.title = PAPPS[app].label; win.document.body.innerHTML = '<p style="font-family:sans-serif;padding:40px;color:#555">Ouverture de ' + PAPPS[app].label + '…</p>'; } catch (_) { /* ignore */ }
  }
  if (btn) btn.disabled = true;
  const r = await pbillCall('app-link', 'POST', { app });
  if (btn) btn.disabled = false;
  if (r && r.ok && typeof r.url === 'string' && /^https:\/\//.test(r.url)) {
    if (win) win.location.replace(r.url); else window.location.assign(r.url);
    return;
  }
  if (win) win.close();
  const code = (r && r.error) || 'network';
  pappsToast(PAPPS_ERRORS[code] || `${PAPPS[app].label} n’a pas pu s’ouvrir. Réessayez dans un instant ; si cela persiste, écrivez-nous à hello@zfind.online.`);
}
