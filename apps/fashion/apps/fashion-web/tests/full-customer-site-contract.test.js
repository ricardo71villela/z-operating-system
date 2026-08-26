const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const shell = read('customer-shell.html');
const routes = read('customer-routes.js');
const runtime = read('customer-site.js');
const css = read('customer-pages.css');
const brandCss = read('customer-brand-authority.css');
const vercel = JSON.parse(read('vercel.json'));

assert.equal(vercel.cleanUrls, false, 'static .html rewrite destinations require cleanUrls disabled');
assert.equal(vercel.outputDirectory, 'public');
assert.match(vercel.buildCommand, /mkdir -p public/);
assert.match(vercel.buildCommand, /cp \.\/\*\.html \.\/\*\.css \.\/\*\.js public\//);
assert.match(vercel.buildCommand, /cp launch\.html public\/index\.html/);
assert.match(vercel.buildCommand, /cp -R brand public\/brand/);
assert.match(vercel.buildCommand, /Z_FASHION_STATIC_PREVIEW_BUILD=PASS/);

assert.match(shell, /<html lang="fr-FR" data-locale="fr">/);
assert.match(shell, /id="localeSelect"/);
for (const locale of ['fr','pt','en','es','it','de']) assert.match(shell, new RegExp(`<option value="${locale}">`));
assert.match(shell, /customer-brand-mark/);
assert.match(shell, /customer-brand-authority\.css/);
assert.match(shell, /customer-brand-logo customer-brand-logo-dark/);
assert.match(shell, /zos-mark-white-tile\.svg/);
assert.match(shell, />Fashion<\/span>/);
assert.match(shell, /footer-brand-logo/);
assert.match(shell, /id="brandEndorsement"/);
assert.doesNotMatch(shell, /customer-brand-square/);
assert.doesNotMatch(shell, /Z Operating System/i);
assert.match(brandCss, /customer-brand-logo\{width:3\.2rem;height:3\.2rem/);
assert.match(brandCss, /customer-brand-logo-dark\{filter:invert\(1\)\}/);
assert.match(brandCss, /footer-brand-logo\{width:2\.85rem;height:3\.45rem/);
assert.match(brandCss, /footer-fashion\{font-family:"Playfair Display"/);

const requiredIds = ['new','women','men','kids','sport','accessories','beauty','sale','search','product','corners','corner','privateSale','favourites','bag','login','account','profile','addresses','orders','order','returns','tracking','checkoutIdentify','checkoutDelivery','checkoutPayment','checkoutReview','checkoutConfirmation','delivery','refunds','help','contact','legalNotice','termsSale','termsUse','privacy','cookies','consent'];
for (const id of requiredIds) assert.match(routes, new RegExp(`id:'${id}'`), `missing route ${id}`);
assert.equal(requiredIds.length, 38);
for (const locale of ['fr','pt','en','es','it','de']) assert.match(routes, new RegExp(`\\b${locale}:\\{`), `missing ${locale} copy`);
assert.match(routes, /Une marque de l’écosystème ZOS/);
assert.match(routes, /Uma marca do ecossistema ZOS/);
assert.match(routes, /A brand of the ZOS ecosystem/);
assert.match(routes, /Una marca del ecosistema ZOS/);
assert.match(routes, /Un marchio dell’ecosistema ZOS/);
assert.match(routes, /Eine Marke des ZOS-Ökosystems/);

assert.match(runtime, /localStorage\.getItem\('zfashion_locale'\)/);
assert.match(runtime, /supported\.includes\(stored\) \? stored : 'fr'/);
assert.doesNotMatch(runtime, /navigator\.language|geolocation|geoip|country[-_]?code/i);
assert.match(runtime, /Z_FASHION_FULL_CUSTOMER_SITE = 'FOUNDATION_PASS'/);
assert.match(runtime, /Payment<\/strong><span>Disabled/);
assert.match(runtime, /Stock reservation<\/strong><span>Disabled/);
assert.match(runtime, /Order creation<\/strong><span>Disabled/);
assert.match(css, /customer-brand-mark/);
assert.match(css, /mobile-dock/);
assert.match(css, /prefers-reduced-motion/);

const rewriteMap = new Map(vercel.rewrites.map(r => [r.source,r.destination]));
const customerSources = ['/femme','/homme','/enfant','/sport','/accessoires','/beaute','/soldes','/nouveautes','/recherche','/corners','/vente-privee','/favoris','/panier','/connexion','/compte','/compte/profil','/compte/adresses','/compte/commandes','/compte/retours','/compte/suivi','/checkout','/checkout/livraison','/checkout/paiement','/checkout/revision','/checkout/confirmation','/livraisons','/retours-remboursements','/aide','/contact','/mentions-legales','/cgv','/conditions-utilisation','/confidentialite','/cookies','/consentement','/produit/:slug','/corner/:slug','/compte/commandes/:id'];
assert.equal(rewriteMap.get('/'), '/launch.html');
for (const source of customerSources) assert.equal(rewriteMap.get(source), '/customer-shell.html', `invalid customer rewrite ${source}`);
assert.equal(rewriteMap.get('/404'), '/404.html');
assert.equal(rewriteMap.get('/erreur'), '/technical-shell.html');
assert.equal(rewriteMap.get('/maintenance'), '/technical-shell.html');

console.log('Z_FASHION_FULL_CUSTOMER_SITE_FOUNDATION=PASS');
