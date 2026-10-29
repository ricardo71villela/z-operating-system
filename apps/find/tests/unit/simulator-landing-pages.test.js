/* Z FIND — pages publiques des simulateurs (src/services/simulator-landing-pages.js). Sans réseau. */
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const S = require(path.join(WEB, 'src', 'services', 'simulator-landing-pages.js'));
const costs = require(path.join(WEB, 'src', 'services', 'acquisition-costs.js'));

let pass = 0, fail = 0;
function check(label, cond) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } }

const BASE = 'https://zfind.online';
const fresh = S.buildSimulatorPages(BASE, new Date('2026-10-24'));
const stale = S.buildSimulatorPages(BASE, new Date('2027-06-01'));
const byPath = Object.fromEntries(fresh.map(p => [p.path, p.html]));

console.log('\n=== 1. inventaire ===');
check('13 pages + 101 départements, toutes sous /fr/', fresh.length === 13 + 101 && fresh.every(p => /^\/fr\/[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(p.path)));
for (const p of fresh) {
  const title = (p.html.match(/<title>(.*?)<\/title>/) || [])[1] || '';
  const desc = (p.html.match(/<meta name="description" content="(.*?)">/) || [])[1] || '';
  const visible = p.html.replace(/<script[\s\S]*?<\/script>/g, '');
  check(`${p.path} : titre ≤ 80, description ≤ 160, canonical, indexable, un seul H1`,
    title.length > 20 && title.length <= 80 && desc.length > 50 && desc.length <= 160 &&
    p.html.includes(`<link rel="canonical" href="${BASE}${p.path}">`) && p.html.includes('content="index,follow"') &&
    (visible.match(/<h1>/g) || []).length === 1);
  check(`${p.path} : ni « undefined » ni « NaN » à l’écran`, !/undefined|NaN/.test(visible));
}

console.log('\n=== 2. contenu et liens ===');
const notaire = byPath['/fr/frais-de-notaire'];
const ex = costs.estimate({ country: 'FR', price: 250000 });
check('frais de notaire : tableau calculé avec le module (250 000 € ancien)', notaire.includes(new Intl.NumberFormat('fr-FR').format(ex.costs) + ' €'));
check('frais de notaire : FAQPage + WebApplication gratuite', notaire.includes('"FAQPage"') && notaire.includes('"WebApplication"') && notaire.includes('"price":"0"'));
check('calculateurs : moteurs intégrés, sans script externe de calcul', notaire.includes('ZFindServices.acquisitionCosts') && !/<script src=/.test(notaire));
check('prêt : lien vers le simulateur complet (route #)', byPath['/fr/simulateur-pret-immobilier'].includes(`${BASE}/#/fr/simulator?market=FR&mode=payment`));
check('prêt : taux de référence daté (source et mois)', /Observatoire Crédit Logement/.test(byPath['/fr/simulateur-pret-immobilier']) && /août 2026/.test(byPath['/fr/simulateur-pret-immobilier']));
check('estimation : liens vers les prix des grandes villes', byPath['/fr/estimation-immobiliere'].includes(`${BASE}/fr/prix-immobilier/france/paris-75056`));
check('sommaire : lien vers chaque outil', ['/fr/frais-de-notaire', '/fr/capacite-emprunt', '/fr/rentabilite-locative', '/fr/frais-achat-immobilier-belgique', '/fr/frais-achat-immobilier-luxembourg'].every(p => byPath['/fr/simulateurs-immobiliers'].includes(BASE + p)));

console.log('\n=== 3. taux expirés : pas de chiffres périmés ===');
const stalePret = stale.find(p => p.path === '/fr/simulateur-pret-immobilier').html;
check('taux expiré : pas de tableau de mensualités ni de taux prérempli', !stalePret.includes('Mensualités selon le montant emprunté') && stalePret.includes('name="rate" inputmode="decimal" value=""'));
check('taux expiré : capacité sans tableau', !stale.find(p => p.path === '/fr/capacite-emprunt').html.includes('Montant empruntable selon les revenus'));

console.log('\n=== 4. le calculateur tourne ===');
function runCalc(html, id, values) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const fields = {}; let out = '';
  for (const [k, v] of Object.entries(values)) fields[k] = { value: String(v), checked: v === true };
  const form = {
    querySelector(sel) { if (sel === '[data-out]') return { set innerHTML(h) { out = h; } }; const m = sel.match(/name="(\w+)"/); return m ? fields[m[1]] || null : null; },
    addEventListener() {}
  };
  const ctx = vm.createContext({ document: { getElementById: x => (x === id ? form : null) }, Intl, Math, Number, String, isFinite, Date, Object });
  ctx.window = ctx; // dans un navigateur, window est l'objet global
  for (const s of scripts) vm.runInContext(s, ctx);
  return out.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}
const notaireOut = runCalc(notaire, 'calc-notaire', { price: '250000', type: 'old', first: false });
check('frais de notaire : 250 000 € → même total que le simulateur', notaireOut.includes(new Intl.NumberFormat('fr-FR').format(ex.costs).replace(/\s/g, ' ')));
const rentOut = runCalc(byPath['/fr/rentabilite-locative'], 'calc-rent', { price: '150000', works: '0', rent: '650', charges: '600', tax: '700', other: '500' });
check('rentabilité : 650 €/mois pour 150 000 € → 5,20 % brut', rentOut.includes('5,20 % brut'));

console.log('\n=== 5. build et site ===');
const gen = fs.readFileSync(path.join(WEB, 'scripts', 'generate-seo-pages.js'), 'utf8');
check('les pages sont écrites au build et ajoutées au sitemap', gen.includes('simulatorPages.buildSimulatorPages(baseUrl)') && gen.includes('sitemapUrls.add(baseUrl + page.path)'));
const body = fs.readFileSync(path.join(WEB, 'src', 'body.html'), 'utf8');
check('pied de page : liens explorables vers les simulateurs', body.includes('<a href="/fr/simulateurs-immobiliers"') && body.includes('<a href="/fr/frais-de-notaire"'));


console.log('\n=== frais de notaire par département ===');
const C = require(path.join(__dirname, '..', '..', 'apps', 'zfind-web', 'src', 'services', 'acquisition-costs.js'));
check('taux DGFiP 1er mai 2026 : Rhône 6,3185 %, Alpes-Maritimes 5,80665 %, Indre 5,09006 %',
  C.frTransferRates('69').standard === 0.063185 && C.frTransferRates('06').standard === 0.0580665 && C.frTransferRates('36').standard === 0.0509006);
check('primo-accédant : 5,80665 % dans un département à 5 %, inchangé ailleurs', C.frTransferRates('75').firstBuyer === 0.0580665 && C.frTransferRates('36').firstBuyer === 0.0509006);
check('sans département : taux à 5 % (comportement inchangé)', C.estimate({ country: 'FR', price: 300000 }).costs === C.estimate({ country: 'FR', price: 300000, department: '69' }).costs);
check('Nice (06) paie moins que Lyon (69) pour 300 000 €', C.estimate({ country: 'FR', price: 300000, department: '06' }).costs < C.estimate({ country: 'FR', price: 300000, department: '69' }).costs);
const rh = byPath['/fr/frais-de-notaire/rhone-69'];
check('page Rhône : titre, H1, exemple au prix médian DVF, lien prix du département', !!rh && rh.includes('<title>Frais de notaire Rhône (69) 2026') && rh.includes('Frais de notaire — Rhône (69) en 2026') && /prix médian du département \(\d/.test(rh) && rh.includes('/fr/prix-immobilier/france/rhone-69'));
check('page Paris : « à Paris »', !!byPath['/fr/frais-de-notaire/paris-75'] && byPath['/fr/frais-de-notaire/paris-75'].includes('Frais de notaire à Paris en 2026'));
check('Alpes-Maritimes : taux réduit expliqué', byPath['/fr/frais-de-notaire/alpes-maritimes-06'].includes('n’a pas relevé sa part'));
check('page nationale : liste des 101 départements et sélecteur', (byPath['/fr/frais-de-notaire'].match(/\/fr\/frais-de-notaire\/[a-z0-9-]+"/g) || []).length >= 101 && byPath['/fr/frais-de-notaire'].includes('name="dep"'));
check('fil d’Ariane département : Simulateurs › Frais de notaire › Rhône', /"position":3,"name":"Frais de notaire"/.test(rh) && /"position":4,"name":"Rhône \(69\)"/.test(rh));
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
