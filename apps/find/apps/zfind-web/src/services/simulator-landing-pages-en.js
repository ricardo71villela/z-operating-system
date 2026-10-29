/* ============================================================
   Z FIND — English property calculators (SEO), built with the French
   pages (simulator-landing-pages.js) and paired with them by hreflang:

     /en/property-calculators                    hub
     /en/french-notary-fees-calculator           France
     /en/belgium-property-buying-costs           Belgium (3 regions)
     /en/luxembourg-property-buying-costs        Luxembourg (Bëllegen Akt)
     /en/france-mortgage-calculator              monthly payment
     /en/france-borrowing-capacity-calculator    borrowing capacity
     /en/rental-yield-calculator                 gross and net yield

   Written for international buyers: same calculation modules, same
   published scales and reference rates as the French pages — no figure
   is invented, and without a current reference rate the payment tables
   are left out.
   ============================================================ */
'use strict';

const seo = require('./seo-page-generator.js');
const costs = require('./acquisition-costs.js');
const rates = require('./credit-rates.js');
const credit = require('./credit-simulator.js');
const FR = require('./simulator-landing-pages.js');

const { STYLE, engineScript, table } = FR._shared;
const EN_PAGES = FR.EN_PAGES;
const FR_OF = Object.fromEntries(Object.entries(FR.EN_ALTERNATE).map(([fr, en]) => [en, fr]));

const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const eur = v => (v == null ? '—' : `€${nf.format(Math.round(v))}`);
const pct = (v, d) => `${(v * 100).toFixed(d == null ? 2 : d)}%`;
const rateTxt = r => `${r}%`;
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const SPA = Object.freeze({
  pret: '/#/en/simulator?market=FR&mode=payment',
  capacite: '/#/en/simulator?market=FR&mode=capacity',
  rentabilite: '/#/en/yield?market=FR&mode=long',
  estimation: '/#/en/estimation?market=FR&mode=owner'
});

const LABELS = Object.freeze({
  transferDuties: 'Transfer duties (the “notary fees” proper)',
  publicityTax: 'Land registration tax (new build)',
  notaryFees: 'Notary’s fees (incl. VAT)',
  securityContribution: 'Land registry contribution',
  disbursements: 'Disbursements and formalities (flat rate)',
  registrationDuties: 'Registration duties',
  adminCosts: 'Administrative costs (flat rate)',
  taxCredit: '“Bëllegen Akt” tax credit'
});
const LABELS_JS = JSON.stringify(LABELS);

/* The French engine formats numbers the French way: switch it to English. */
const EN_ENGINE = `<script>(function(){var Z=window.ZS;Z.nf=new Intl.NumberFormat('en-GB',{maximumFractionDigits:0});Z.eur=function(v){return v==null||!isFinite(v)?'—':'€'+Z.nf.format(Math.round(v));};Z.num=function(f,n){var el=f.querySelector('[name="'+n+'"]');if(!el)return 0;return Number(String(el.value).replace(/[\\s,€]/g,''))||0;};})();</script>`;

function field(name, label, value) {
  return `<div class="zs-field"><label for="f-${name}">${esc(label)}</label><input id="f-${name}" name="${name}" inputmode="decimal" value="${esc(value)}"></div>`;
}

function shell({ base, pathName, title, description, crumb, eyebrow, h1, lead, body, faq, scripts }) {
  const canonical = base + pathName;
  const frPath = FR_OF[pathName];
  const desc = seo.buildMetaDescription(description, 158);
  const breadcrumbs = [{ name: 'Z Find', path: '/' }, { name: 'Property calculators', path: EN_PAGES.hub }].concat(pathName === EN_PAGES.hub ? [] : [{ name: crumb, path: pathName }]);
  const lds = [
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: breadcrumbs.map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.name, item: base + b.path })) },
    { '@context': 'https://schema.org', '@type': pathName === EN_PAGES.hub ? 'CollectionPage' : 'WebApplication', name: h1, url: canonical, inLanguage: 'en', ...(pathName === EN_PAGES.hub ? {} : { applicationCategory: 'FinanceApplication', operatingSystem: 'Web', offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' } }) }
  ];
  if (faq && faq.length) lds.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
  const others = [
    [EN_PAGES.notaire, 'French notary fees'], [EN_PAGES.pret, 'Mortgage calculator'], [EN_PAGES.capacite, 'Borrowing capacity'],
    [EN_PAGES.rentabilite, 'Rental yield'], [EN_PAGES.belgique, 'Buying costs in Belgium'], [EN_PAGES.luxembourg, 'Buying costs in Luxembourg'],
    ['/en/real-estate-glossary', 'French property glossary']
  ].filter(([p]) => p !== pathName);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${esc(canonical)}">
${frPath ? `<link rel="alternate" hreflang="fr" href="${esc(base + frPath)}">\n<link rel="alternate" hreflang="en" href="${esc(canonical)}">\n<link rel="alternate" hreflang="x-default" href="${esc(base + frPath)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Z Find">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(base)}/brand/z-find-logo-gold.png">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary">
${lds.map(o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n')}
${seo.presentationHead()}
${STYLE}
</head>
<body class="zf-seo-body">
<header class="zf-seo-site-header">
  <div class="zf-seo-wrap zf-seo-nav">
    <a class="zf-seo-brand" href="${base}/" aria-label="Z Find">Z <em>Find</em></a>
    <a class="zf-seo-nav-cta" href="${base}${frPath || '/'}" hreflang="fr" lang="fr">Français</a>
  </div>
</header>
<main class="zf-seo-main">
  <div class="zf-seo-wrap">
    <nav class="zf-seo-breadcrumb" aria-label="Breadcrumb">${breadcrumbs.map((b, i) => i === breadcrumbs.length - 1 ? `<span>${esc(b.name)}</span>` : `<a href="${base}${b.path}">${esc(b.name)}</a>`).join(' / ')}</nav>
    <header class="zf-seo-hero">
      <p class="zf-seo-eyebrow">${esc(eyebrow)}</p>
      <h1>${esc(h1)}</h1>
      <p class="zf-seo-lead">${esc(lead)}</p>
    </header>
${body}
${faq && faq.length ? `    <section class="zs-section zs-faq"><h2>Frequently asked questions</h2>${faq.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</section>` : ''}
    <section class="zs-section"><h2>Other Z Find tools</h2><ul class="zs-links">${others.map(([p, l]) => `<li><a href="${base}${p}">${esc(l)}</a></li>`).join('')}</ul></section>
    <p class="zs-small" style="margin-top:30px">Free indicative calculations, no sign-up: not a loan offer, nor legal, tax or financial advice. Ask a notary, a bank or a broker about your own situation.</p>
  </div>
</main>
${scripts || ''}
</body>
</html>`;
}

const out = (id, body) => `${engineScript()}${EN_ENGINE}<script>ZS.bind('${id}',function(f){${body}});</script>`;
const linesOf = `var L=${LABELS_JS};return '<p class="zs-big">'+ZS.eur(r.costs)+'</p><p>'+(r.costsRate*100).toFixed(2)+'% of the price — total cost '+ZS.eur(r.total)+'</p>'+ZS.lines(r.lines.map(function(l){return [L[l.key]||l.key,ZS.eur(l.amount)];}));`;

function pageNotaire(base) {
  const prices = [100000, 150000, 200000, 250000, 300000, 400000, 500000, 750000, 1000000];
  const rows = prices.map(p => {
    const a = costs.estimate({ country: 'FR', price: p });
    const f = costs.estimate({ country: 'FR', price: p, firstBuyer: true });
    const n = costs.estimate({ country: 'FR', price: p, newBuild: true });
    return [eur(p), `${eur(a.costs)} <span class="zs-small">(${pct(a.costsRate, 1)})</span>`, eur(f.costs), `${eur(n.costs)} <span class="zs-small">(${pct(n.costsRate, 1)})</span>`];
  });
  const ex = costs.estimate({ country: 'FR', price: 250000 });
  const faq = [
    { q: 'How much are notary fees in France?', a: `For an existing home, about ${pct(ex.costsRate, 1)} of the price: transfer duties (${pct(0.063185, 4)} in 89 départements, less in the others), the notary’s regulated fees, the 0.1% land registry contribution and about €1,200 of disbursements. For a €250,000 home the total is about ${eur(ex.costs)}.` },
    { q: 'Are notary fees lower for a new build?', a: 'Yes. For a new build sold off-plan (VEFA), a 0.715% land registration tax replaces the transfer duties: fees fall to about 2–3% of the price.' },
    { q: 'Do foreign buyers pay more?', a: 'No. Notary fees in France depend on the property, not on the buyer’s nationality or residence. Only the reduced rate for first-time buyers requires the home to become your main residence.' },
    { q: 'Who chooses the notary?', a: 'Each party may have their own notary at no extra cost: the fees are shared between them. Your notary checks the title, the planning rules and the diagnostics before you sign.' }
  ];
  const body = `    <form class="zs-calc" id="calc-notaire" novalidate>
      <h2>Calculate my notary fees</h2>
      <div class="zs-grid">${field('price', 'Property price (€)', '250000')}
        <div class="zs-field"><label for="f-type">Property</label><select id="f-type" name="type"><option value="old">Existing home</option><option value="new">New build (off-plan)</option></select></div></div>
      <p class="zs-check" style="margin-top:14px"><input type="checkbox" id="f-first" name="first"><label for="f-first">First-time buyer, main residence</label></p>
      <div class="zs-out" data-out aria-live="polite"></div>
      <div class="zs-ctas"><a class="zf-seo-primary" href="${base}${EN_PAGES.pret}">Calculate the mortgage →</a></div>
    </form>
    <section class="zs-section"><h2>Notary fees by price</h2>
      ${table(['Price', 'Existing home', 'Existing, first-time buyer', 'New build'], rows)}
      <p class="zs-small">2026 scales used by the Z Find calculators (transfer duties after the 2025 reform, regulated fees + 20% VAT, 0.1% land registry contribution, flat-rate disbursements). Rates per département on the <a href="${base}/fr/frais-de-notaire">French page</a>.</p>
    </section>
    <section class="zs-section"><h2>What the “notary fees” are</h2>
      <p>About 80% of the so-called notary fees are taxes collected for the State and local authorities: the transfer duties. The notary is paid regulated fees on a national sliding scale (3.870% up to €6,500, then 1.596%, 1.064% and 0.799% above €60,000), plus VAT, the land registry contribution and disbursements (land register, mortgage search, formalities).</p>
      <p>Before you calculate, check the <a href="${base}/fr/prix-immobilier/france">price per m² of each French commune</a> (official DVF sales).</p>
    </section>`;
  return { path: EN_PAGES.notaire, html: shell({
    base, pathName: EN_PAGES.notaire, crumb: 'French notary fees', eyebrow: 'Free calculator · France 2026',
    title: 'French notary fees calculator 2026: buying property in France | Z Find',
    description: `Calculate notary fees when buying property in France in 2026: about ${pct(ex.costsRate, 1)} of the price for an existing home, 2–3% for a new build. Full breakdown and table by price.`,
    h1: 'French notary fees calculator 2026', lead: 'Transfer duties, the notary’s fees and disbursements: exactly what you will pay on top of the price when buying a home in France.',
    body, faq, scripts: out('calc-notaire', `var r=ZS.c.estimate({country:'FR',price:ZS.num(f,'price'),newBuild:ZS.val(f,'type')==='new',firstBuyer:ZS.on(f,'first')});if(r.error)return '<p>Enter a price.</p>';${linesOf}`)
  }) };
}

function pageBelgique(base) {
  const prices = [200000, 300000, 400000, 500000, 750000];
  const regions = [['WAL', 'Wallonia'], ['VLG', 'Flanders'], ['BRU', 'Brussels']];
  const rows = prices.map(p => [eur(p)].concat(regions.map(([r]) => eur(costs.estimate({ country: 'BE', price: p, region: r, ownHome: true }).costs))));
  const ex = costs.estimate({ country: 'BE', price: 300000, region: 'WAL', ownHome: true });
  const faq = [
    { q: 'What are registration duties in Wallonia?', a: '3% when buying your only own home, 12.5% otherwise (2026).' },
    { q: 'What are registration duties in Flanders?', a: '2% when buying your only own home, 12% otherwise (2026).' },
    { q: 'What is the Brussels allowance?', a: 'The 12.5% duties are not due on the first €200,000 when you buy your own home, provided the price does not exceed €600,000.' },
    { q: 'How much does the notary cost in Belgium?', a: `Fees follow a legal sliding scale, plus 21% VAT and about €1,200 of administrative costs. For a €300,000 own home in Wallonia the total costs are about ${eur(ex.costs)}.` }
  ];
  const body = `    <form class="zs-calc" id="calc-be" novalidate>
      <h2>Calculate my buying costs in Belgium</h2>
      <div class="zs-grid">${field('price', 'Property price (€)', '300000')}
        <div class="zs-field"><label for="f-region">Region</label><select id="f-region" name="region"><option value="WAL">Wallonia</option><option value="VLG">Flanders</option><option value="BRU">Brussels-Capital</option></select></div></div>
      <p class="zs-check" style="margin-top:14px"><input type="checkbox" id="f-own" name="own" checked><label for="f-own">My only own home (I will live there)</label></p>
      <div class="zs-out" data-out aria-live="polite"></div>
    </form>
    <section class="zs-section"><h2>Buying costs of an own home by region</h2>
      ${table(['Price', 'Wallonia', 'Flanders', 'Brussels'], rows)}
      <p class="zs-small">2026 regional registration duties, notary’s fees on the legal scale + 21% VAT, flat-rate administrative costs.</p>
    </section>`;
  return { path: EN_PAGES.belgique, html: shell({
    base, pathName: EN_PAGES.belgique, crumb: 'Buying costs in Belgium', eyebrow: 'Free calculator · Belgium 2026',
    title: 'Belgium property buying costs 2026: registration duties and notary | Z Find',
    description: 'Calculate the costs of buying a home in Belgium in 2026: registration duties in Wallonia (3%), Flanders (2%) and Brussels (€200,000 allowance), notary’s fees and administrative costs.',
    h1: 'Property buying costs in Belgium', lead: 'Your region’s registration duties, the notary’s fees and administrative costs: the real cost of buying in Wallonia, Flanders or Brussels.',
    body, faq, scripts: out('calc-be', `var r=ZS.c.estimate({country:'BE',price:ZS.num(f,'price'),region:ZS.val(f,'region'),ownHome:ZS.on(f,'own')});if(r.error)return '<p>Enter a price.</p>';${linesOf}`)
  }) };
}

function pageLuxembourg(base) {
  const prices = [500000, 750000, 1000000, 1250000];
  const rows = prices.map(p => [eur(p), eur(costs.estimate({ country: 'LU', price: p }).costs), eur(costs.estimate({ country: 'LU', price: p, ownHome: true, buyers: 1 }).costs), eur(costs.estimate({ country: 'LU', price: p, ownHome: true, buyers: 2 }).costs)]);
  const faq = [
    { q: 'What are the registration costs in Luxembourg?', a: '7% of the price: 6% registration duties and 1% transcription duties.' },
    { q: 'What is the Bëllegen Akt?', a: 'A tax credit on registration duties of up to €40,000 per buyer, when buying your main residence. It does not apply to a buy-to-let.' },
    { q: 'Are the notary’s fees included?', a: 'No: this calculation covers the registration and transcription duties; the notary’s fees come on top.' }
  ];
  const body = `    <form class="zs-calc" id="calc-lu" novalidate>
      <h2>Calculate my registration duties in Luxembourg</h2>
      <div class="zs-grid">${field('price', 'Property price (€)', '750000')}
        <div class="zs-field"><label for="f-buyers">Number of buyers</label><select id="f-buyers" name="buyers"><option value="1">1</option><option value="2" selected>2</option></select></div></div>
      <p class="zs-check" style="margin-top:14px"><input type="checkbox" id="f-own" name="own" checked><label for="f-own">Main residence (Bëllegen Akt)</label></p>
      <div class="zs-out" data-out aria-live="polite"></div>
    </form>
    <section class="zs-section"><h2>Duties by price</h2>
      ${table(['Price', 'Without tax credit', 'Main residence, 1 buyer', 'Main residence, 2 buyers'], rows)}
    </section>`;
  return { path: EN_PAGES.luxembourg, html: shell({
    base, pathName: EN_PAGES.luxembourg, crumb: 'Buying costs in Luxembourg', eyebrow: 'Free calculator · Luxembourg 2026',
    title: 'Luxembourg property buying costs 2026: 7% duties and Bëllegen Akt | Z Find',
    description: 'Calculate the registration and transcription duties (7%) when buying property in Luxembourg, and the Bëllegen Akt tax credit (up to €40,000 per buyer).',
    h1: 'Property buying costs in Luxembourg', lead: 'Registration and transcription duties and the Bëllegen Akt tax credit: what buying a home in the Grand Duchy really costs.',
    body, faq, scripts: out('calc-lu', `var r=ZS.c.estimate({country:'LU',price:ZS.num(f,'price'),ownHome:ZS.on(f,'own'),buyers:Number(ZS.val(f,'buyers'))});if(r.error)return '<p>Enter a price.</p>';var L=${LABELS_JS};return '<p class="zs-big">'+ZS.eur(r.costs)+'</p><p>Notary’s fees not included.</p>'+ZS.lines(r.lines.map(function(l){return [L[l.key]||l.key,ZS.eur(l.amount)];}));`)
  }) };
}

function pagePret(base, today) {
  const durations = [15, 20, 25];
  const refs = durations.map(y => rates.reference('FR', y, today));
  const ref20 = refs[1];
  const hasRates = refs.every(Boolean);
  const loans = [100000, 150000, 200000, 250000, 300000, 400000, 500000];
  const rows = hasRates ? loans.map(l => [eur(l)].concat(refs.map(r => eur(credit.payment({ loan: l, ratePct: r.ratePct, years: r.years, insurancePct: 0 }).monthly)))) : [];
  const ex = ref20 ? credit.payment({ loan: 200000, ratePct: ref20.ratePct, years: 20, insurancePct: 0 }) : null;
  const faq = [
    { q: 'How is a French mortgage payment calculated?', a: 'Payment = loan × r / (1 − (1 + r)^−n), where r is the annual rate divided by 12 and n the number of months. Borrower insurance comes on top.' + (ex ? ` Example: €200,000 over 20 years at ${rateTxt(ref20.ratePct)} gives ${eur(ex.monthly)} a month before insurance.` : '') },
    { q: 'What is the average mortgage rate in France?', a: hasRates ? `${refs.map(r => `${rateTxt(r.ratePct)} over ${r.years} years`).join(', ')} (${ref20.source.name}, ${rates.periodLabel(ref20.period, 'en')}).` : 'Z Find uses the latest average rate published by the Observatoire Crédit Logement / CSA.' },
    { q: 'Can non-residents get a mortgage in France?', a: 'Yes, many French banks lend to non-residents, usually with a larger deposit (often 20–30%) and proof of income. The 35% debt-to-income rule applies to all borrowers.' },
    { q: 'What is the maximum term?', a: 'French lending rules cap the term at 25 years (27 years with a deferral for a new build), and the payment, insurance included, at 35% of net income.' }
  ];
  const body = `    <form class="zs-calc" id="calc-pret" novalidate>
      <h2>Calculate my monthly payment</h2>
      <div class="zs-grid">${field('price', 'Property price (€)', '250000')}${field('deposit', 'Deposit (€)', '25000')}
        <div class="zs-field"><label for="f-years">Term</label><select id="f-years" name="years">${durations.map(y => `<option value="${y}"${y === 20 ? ' selected' : ''}>${y} years</option>`).join('')}</select></div>
        ${field('rate', 'Annual rate (%)', ref20 ? String(ref20.ratePct) : '')}${field('ins', 'Insurance (% / year)', '0.30')}</div>
      <p class="zs-check" style="margin-top:14px"><input type="checkbox" id="f-costs" name="costs" checked><label for="f-costs">Add French notary fees (existing home) to the loan</label></p>
      <div class="zs-out" data-out aria-live="polite"></div>
      <div class="zs-ctas"><a class="zf-seo-primary" href="${base}${SPA.pret}">Open the full calculator →</a></div>
    </form>
    ${hasRates ? `<section class="zs-section"><h2>Monthly payments by loan amount</h2>
      ${table(['Loan'].concat(refs.map(r => `${r.years} years (${rateTxt(r.ratePct)})`)), rows)}
      <p class="zs-small">Before borrower insurance. Average rates: ${esc(ref20.source.name)}, ${esc(rates.periodLabel(ref20.period, 'en'))}.</p>
    </section>` : ''}`;
  return { path: EN_PAGES.pret, html: shell({
    base, pathName: EN_PAGES.pret, crumb: 'France mortgage calculator', eyebrow: 'Free calculator · 2026 rates',
    title: 'France mortgage calculator 2026: monthly payment and loan cost | Z Find',
    description: `Calculate a French mortgage for free: monthly payment, interest and insurance cost, notary fees included${ref20 ? `, at the average rate of ${rateTxt(ref20.ratePct)} over 20 years` : ''}. Payment table from €100,000 to €500,000.`,
    h1: 'France mortgage calculator', lead: 'Monthly payment, total cost of the loan and the income you need, with French notary fees and the latest published average rate.',
    body, faq, scripts: out('calc-pret', `var p=ZS.num(f,'price'),d=ZS.num(f,'deposit'),y=Number(ZS.val(f,'years')),t=ZS.num(f,'rate'),i=ZS.num(f,'ins');if(!(p>0)||!(t>0))return '<p>Enter a price and a rate.</p>';var c=ZS.on(f,'costs')?ZS.c.estimate({country:'FR',price:p}).costs:0;var loan=Math.max(0,p+c-d);var m=loan*ZS.annuity(t,y),a=loan*i/100/12;var n=y*12;return '<p class="zs-big">'+ZS.eur(m+a)+' / month</p>'+ZS.lines([['Loan amount',ZS.eur(loan)],['of which notary fees',ZS.eur(c)],['Payment before insurance',ZS.eur(m)],['Insurance',ZS.eur(a)+' / month'],['Interest cost',ZS.eur(m*n-loan)],['Insurance cost',ZS.eur(a*n)],['Net income needed (35%)',ZS.eur((m+a)/0.35)+' / month']]);`)
  }) };
}

function pageCapacite(base, today) {
  const refs = [20, 25].map(y => rates.reference('FR', y, today));
  const ref25 = refs[1];
  const hasRates = refs.every(Boolean);
  const incomes = [2000, 2500, 3000, 3500, 4000, 5000, 6000, 8000];
  const rows = hasRates ? incomes.map(inc => [eur(inc)].concat(refs.map(r => eur(credit.capacity({ market: 'FR', income: inc, ratioPct: 35, ratePct: r.ratePct, years: r.years, insurancePct: 0.3, deposit: 0 }).maxLoan)))) : [];
  const ex = ref25 ? credit.capacity({ market: 'FR', income: 4000, ratioPct: 35, ratePct: ref25.ratePct, years: 25, insurancePct: 0.3, deposit: 30000 }) : null;
  const faq = [
    { q: 'How much can I borrow in France?', a: 'Your monthly payment, insurance included, may not exceed 35% of your net income (HCSF rule), over 25 years at most.' + (ex ? ` With a net income of €4,000 a month that is ${eur(ex.maxMonthly)} a month, about ${eur(ex.maxLoan)} over 25 years at ${rateTxt(ref25.ratePct)}.` : '') },
    { q: 'How is the debt-to-income ratio calculated?', a: 'Debt-to-income = (all loan payments + the new payment, insurance included) / net monthly income before tax.' },
    { q: 'What property price can I aim for?', a: ex && ex.maxPrice ? `Add your deposit to the amount you can borrow, then take off the notary fees. With a €30,000 deposit in the example above, the maximum price is about ${eur(ex.maxPrice)} for an existing home.` : 'Add your deposit to the amount you can borrow, then take off the notary fees.' }
  ];
  const body = `    <form class="zs-calc" id="calc-cap" novalidate>
      <h2>Calculate my borrowing capacity</h2>
      <div class="zs-grid">${field('income', 'Household net income (€ / month)', '4000')}${field('loans', 'Current loan payments (€ / month)', '0')}${field('deposit', 'Deposit (€)', '30000')}
        <div class="zs-field"><label for="f-years">Term</label><select id="f-years" name="years">${[15, 20, 25].map(y => `<option value="${y}"${y === 25 ? ' selected' : ''}>${y} years</option>`).join('')}</select></div>
        ${field('rate', 'Annual rate (%)', ref25 ? String(ref25.ratePct) : '')}${field('ins', 'Insurance (% / year)', '0.30')}</div>
      <div class="zs-out" data-out aria-live="polite"></div>
      <div class="zs-ctas"><a class="zf-seo-primary" href="${base}${SPA.capacite}">Open the full calculator →</a></div>
    </form>
    ${hasRates ? `<section class="zs-section"><h2>Amount you can borrow by income</h2>
      ${table(['Net income / month'].concat(refs.map(r => `${r.years} years (${rateTxt(r.ratePct)})`)), rows)}
      <p class="zs-small">35% debt-to-income ratio, insurance 0.30% a year, no other loan. Average rates: ${esc(refs[0].source.name)}, ${esc(rates.periodLabel(refs[0].period, 'en'))}.</p>
    </section>` : ''}`;
  return { path: EN_PAGES.capacite, html: shell({
    base, pathName: EN_PAGES.capacite, crumb: 'Borrowing capacity', eyebrow: 'Free calculator · 35% rule',
    title: 'How much can I borrow in France? Borrowing capacity calculator 2026 | Z Find',
    description: 'Calculate how much you can borrow in France from your income, current loans and deposit (HCSF 35% rule), and the maximum property price with notary fees included.',
    h1: 'France borrowing capacity calculator', lead: 'How much can you borrow, and for what price? The French 35% rule applied to your income, with the latest average rate and notary fees.',
    body, faq, scripts: out('calc-cap', `var inc=ZS.num(f,'income'),o=ZS.num(f,'loans'),d=ZS.num(f,'deposit'),y=Number(ZS.val(f,'years')),t=ZS.num(f,'rate'),i=ZS.num(f,'ins');if(!(inc>0)||!(t>0))return '<p>Enter your income and a rate.</p>';var max=Math.max(0,inc*0.35-o),per=ZS.annuity(t,y)+i/100/12,loan=per>0?Math.floor(max/per/1000)*1000:0,budget=loan+d;var lo=0,hi=budget;for(var k=0;k<60;k++){var mid=(lo+hi)/2,c=ZS.c.estimate({country:'FR',price:mid});if(!c.error&&mid+c.costs<=budget)lo=mid;else hi=mid;}var price=Math.floor(lo/1000)*1000;return '<p class="zs-big">'+ZS.eur(loan)+'</p><p>over '+y+' years</p>'+ZS.lines([['Maximum payment (35%)',ZS.eur(max)+' / month'],['Budget with deposit',ZS.eur(budget)],['Maximum price (existing home, fees included)',ZS.eur(price)]]);`)
  }) };
}

function pageRentabilite(base) {
  const faq = [
    { q: 'How do I calculate gross rental yield?', a: 'Gross yield = annual rent / purchase price × 100. A studio bought for €150,000 and let for €650 a month earns €7,800 a year: 5.2% gross.' },
    { q: 'And net rental yield?', a: 'Net yield = (annual rent − non-recoverable charges − property tax − insurance − management − upkeep) / (price + notary fees + works) × 100. It is usually 1 to 2 points below the gross yield.' },
    { q: 'What is a good rental yield in France?', a: 'It depends on the city: where prices per m² are high, gross yields are usually lower. Always compare with the commune’s price per m², rental demand and the risk of vacancy.' }
  ];
  const body = `    <form class="zs-calc" id="calc-rent" novalidate>
      <h2>Calculate the yield of my investment</h2>
      <div class="zs-grid">${field('price', 'Purchase price (€)', '150000')}${field('works', 'Works (€)', '0')}${field('rent', 'Monthly rent excl. charges (€)', '650')}${field('charges', 'Non-recoverable charges (€ / year)', '600')}${field('tax', 'Property tax (€ / year)', '700')}${field('other', 'Insurance, management, upkeep (€ / year)', '500')}</div>
      <div class="zs-out" data-out aria-live="polite"></div>
      <div class="zs-ctas"><a class="zf-seo-primary" href="${base}${SPA.rentabilite}">Full calculator (tax, loan, cash flow) →</a></div>
    </form>`;
  return { path: EN_PAGES.rentabilite, html: shell({
    base, pathName: EN_PAGES.rentabilite, crumb: 'Rental yield', eyebrow: 'Free calculator · Buy-to-let',
    title: 'Rental yield calculator: gross and net yield in France | Z Find',
    description: 'Calculate the gross and net rental yield of a property investment in France: rent, charges, property tax, notary fees and works. Full calculator with loan and tax.',
    h1: 'Rental yield calculator', lead: 'The gross and net yield of your investment, notary fees and charges included, in seconds.',
    body, faq, scripts: out('calc-rent', `var p=ZS.num(f,'price'),w=ZS.num(f,'works'),r=ZS.num(f,'rent')*12,ch=ZS.num(f,'charges')+ZS.num(f,'tax')+ZS.num(f,'other');if(!(p>0)||!(r>0))return '<p>Enter a price and a rent.</p>';var c=ZS.c.estimate({country:'FR',price:p}).costs,inv=p+c+w;var pc=function(v){return (v*100).toFixed(2)+'%';};return '<p class="zs-big">'+pc((r-ch)/inv)+' net</p><p>'+pc(r/p)+' gross</p>'+ZS.lines([['Annual rent',ZS.eur(r)],['Annual charges',ZS.eur(ch)],['Notary fees',ZS.eur(c)],['Total investment',ZS.eur(inv)],['Net income before tax',ZS.eur(r-ch)+' / year']]);`)
  }) };
}

function pageHub(base) {
  const cards = [
    [EN_PAGES.notaire, 'French notary fees', 'Existing home, new build, first-time buyer: the exact costs of buying in France.'],
    [EN_PAGES.pret, 'France mortgage calculator', 'Monthly payment, loan cost and the income you need.'],
    [EN_PAGES.capacite, 'Borrowing capacity', 'How much you can borrow, and for what price.'],
    [EN_PAGES.rentabilite, 'Rental yield', 'Gross and net yield of a buy-to-let.'],
    [EN_PAGES.belgique, 'Buying costs in Belgium', 'Registration duties in Wallonia, Flanders and Brussels.'],
    [EN_PAGES.luxembourg, 'Buying costs in Luxembourg', '7% duties and the Bëllegen Akt tax credit.']
  ];
  return { path: EN_PAGES.hub, html: shell({
    base, pathName: EN_PAGES.hub, crumb: 'Property calculators', eyebrow: 'Free tools · France, Belgium, Luxembourg',
    title: 'Free property calculators: French notary fees, mortgage, yield | Z Find',
    description: 'Free property calculators for buying in France, Belgium and Luxembourg: French notary fees, mortgage payment, borrowing capacity, rental yield and buying costs.',
    h1: 'Free property calculators', lead: 'Buy, finance, invest: the key calculations of a property project in France, Belgium and Luxembourg, with the published scales and rates.',
    body: `    <section class="zs-cards">${cards.map(([p, t, d]) => `<a class="zs-card" href="${base}${p}"><h2>${esc(t)} →</h2><p>${esc(d)}</p></a>`).join('')}</section>`
  }) };
}

function buildSimulatorPagesEn(baseUrl, today) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) throw new Error('Simulator pages require a real SITE_BASE_URL.');
  const t = today || new Date();
  return [pageHub(base), pageNotaire(base), pageBelgique(base), pageLuxembourg(base), pagePret(base, t), pageCapacite(base, t), pageRentabilite(base)];
}

module.exports = { EN_PAGES, buildSimulatorPagesEn };
