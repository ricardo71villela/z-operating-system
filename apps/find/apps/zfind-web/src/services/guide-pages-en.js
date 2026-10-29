/* ============================================================
   Z FIND — English guide for international buyers (SEO)

     /en/guides/buying-property-in-france

   Written for buyers living abroad: who may buy, the steps from offer
   to deed, the costs, a mortgage as a non-resident, the taxes of owning
   and selling, inheritance. Consistent with the French legal guide
   (/fr/guides/immobilier-france, chapter « Acheteur étranger ») and
   linked to the English calculators and glossary.
   ============================================================ */
'use strict';

const seo = require('./seo-page-generator.js');
const costs = require('./acquisition-costs.js');
const FR = require('./simulator-landing-pages.js');

const { STYLE } = FR._shared;
const EN_PAGES = FR.EN_PAGES;
const PATH = '/en/guides/buying-property-in-france';
const UPDATED = 'October 2026';

const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const eur = v => `€${nf.format(Math.round(v))}`;
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const G = '/en/real-estate-glossary';

function sections(base) {
  const ex = costs.estimate({ country: 'FR', price: 300000 });
  const exNew = costs.estimate({ country: 'FR', price: 300000, newBuild: true });
  const term = (slug, label) => `<a href="${base}${G}/${slug}">${esc(label)}</a>`;
  return [
    { id: 'who-can-buy', h: 'Can foreigners buy property in France?', html: `
      <p>Yes. France sets no general restriction linked to nationality or residence on buying a home, whether a main residence or a second home, and no visa or special permit is needed to buy. A foreign buyer has the same rights as a French buyer.</p>
      <p>The one exception concerns farmland, forests and some rural property: the SAFER holds a ${term('pre-emption-right', 'pre-emption right')} on almost all such sales, whatever the buyer’s nationality, and may step in to keep the land in farming or environmental use.</p>
      <p>Owning property gives no right to live in France. Citizens of countries outside the EU/EEA and Switzerland may stay up to 90 days in any 180 without a long-stay visa; a home can support a visa application (for example a “visitor” visa) but never guarantees it. France has no “golden visa” linking property investment to residence.</p>` },
    { id: 'steps', h: 'The buying process, step by step', html: `
      <ol>
        <li><b>Offer.</b> You make a written offer (offre d’achat) at a price; once the seller accepts it in writing, the price is agreed.</li>
        <li><b>Preliminary contract.</b> Buyer and seller sign a ${term('preliminary-sale-agreement', 'preliminary sale agreement')} (compromis or promesse de vente), at the notary’s office or the agency. You usually pay a deposit of 5 to 10% of the price, held by the notary.</li>
        <li><b>Cooling-off period.</b> As a private buyer of a home, you have a ${term('cooling-off-period', '10-day cooling-off period')} after receiving the signed contract, during which you may withdraw without giving a reason and get your deposit back.</li>
        <li><b>Conditions.</b> The contract lists ${term('condition-precedent', 'conditions precedent')} — most often obtaining your mortgage, typically within 45 to 60 days. If a condition fails, the sale is cancelled and the deposit returned.</li>
        <li><b>Surveys.</b> The seller must provide the ${term('technical-survey-file', 'technical survey file')}: ${term('energy-performance-certificate', 'energy performance certificate (DPE)')}, lead (homes built before 1949), asbestos (permit before July 1997), termites where applicable, gas and electricity installations over 15 years old, natural and technological risks, sewage, and the Carrez floor area for a flat in a co-ownership.</li>
        <li><b>Final deed.</b> About two to three months after the preliminary contract, you sign the ${term('notarial-deed-of-sale', 'deed of sale')} (acte authentique) before the notary and pay the balance and the fees. You become the owner on that day. If you cannot travel, you can sign through a power of attorney.</li>
      </ol>
      <p>Notaries, banks and estate agents must check your identity and the origin of your funds under anti-money-laundering rules: keep bank statements and proof of the source of the money ready.</p>` },
    { id: 'costs', h: 'How much does buying cost?', html: `
      <p>On top of the price, budget the ${term('notary', 'notary')} fees — mostly ${term('transfer-duties', 'transfer duties')} collected for the State. For an existing home of ${eur(300000)}, they come to about ${eur(ex.costs)} (${(ex.costsRate * 100).toFixed(1)}%); for a new build, about ${eur(exNew.costs)} (${(exNew.costsRate * 100).toFixed(1)}%). <a href="${base}${EN_PAGES.notaire}">Calculate your notary fees</a>.</p>
      <p>Estate agency fees are set freely by each agency and must be shown in the listing, with who pays them (seller or buyer). They are commonly between 3 and 8% of the price. Add a mortgage guarantee and broker fees if you borrow.</p>` },
    { id: 'mortgage', h: 'Getting a mortgage as a non-resident', html: `
      <p>Many French banks lend to non-residents, usually with a larger deposit (often 20 to 30% of the price), proof of income and a full file on the origin of your funds. The same lending rules apply to everyone: the payment, borrower insurance included, may not exceed 35% of net income, and the term is capped at 25 years.</p>
      <p><a href="${base}${EN_PAGES.pret}">Calculate your monthly payment</a> or <a href="${base}${EN_PAGES.capacite}">how much you can borrow</a>.</p>` },
    { id: 'owning', h: 'Taxes when you own a home in France', html: `
      <ul>
        <li><b>${term('property-tax', 'Property tax')}</b> (taxe foncière), paid every year by the owner.</li>
        <li><b>${term('council-tax', 'Council tax on second homes')}</b> (taxe d’habitation): abolished for main residences but still due on second homes, with a surcharge of up to 60% in some towns where housing is scarce.</li>
        <li><b>${term('real-estate-wealth-tax', 'Real estate wealth tax')}</b> (IFI) if your net French property assets exceed €1.3 million (for non-residents, only property in France counts).</li>
        <li><b>Rental income</b> from a French property is taxed in France, at a minimum rate of 20% for non-residents, plus social charges (17.2%, or 7.5% if you are covered by the social security of another EU/EEA country or Switzerland). A double tax treaty usually avoids being taxed twice.</li>
      </ul>` },
    { id: 'selling', h: 'Selling: capital gains tax', html: `
      <p>A non-resident selling a French property pays tax on the ${term('capital-gain', 'capital gain')} at 19%, plus social charges (17.2%, or 7.5% for people covered by EU/EEA or Swiss social security). Taper relief applies with the years of ownership: the gain is exempt from the 19% after 22 years and from social charges after 30 years.</p>
      <p>Residents of countries outside the EU/EEA selling for more than €150,000 must appoint an accredited tax representative, unless they have owned the property for more than 30 years.</p>` },
    { id: 'inheritance', h: 'Inheritance', html: `
      <p>French law protects children with a reserved share of the estate. Under the EU Succession Regulation, you can choose in your will that the law of your nationality applies to your whole estate, including your French property. French inheritance tax may be due on property located in France: take advice from a notary when you buy, especially on how to hold the property (in your own names, as a couple, or through a company).</p>` }
  ];
}

const FAQ = [
  { q: 'Can a foreigner buy a house in France?', a: 'Yes. There is no general restriction based on nationality or residence: a foreign buyer has the same rights as a French buyer. Only farmland and some rural property are subject to the SAFER’s pre-emption right, whoever the buyer.' },
  { q: 'Does buying property in France give a right of residence?', a: 'No. Owning a home gives no right to live in France. Non-EU citizens may stay up to 90 days in any 180 without a long-stay visa; a home can support a visa application but does not guarantee it.' },
  { q: 'How long does it take to buy a property in France?', a: 'Usually two to three months between the preliminary contract and the final deed, longer if you need a mortgage or if a pre-emption right applies.' },
  { q: 'Can I buy without travelling to France?', a: 'Yes. You can sign the preliminary contract and the final deed through a power of attorney given to someone in France, often a notary’s clerk.' },
  { q: 'Do non-residents pay more notary fees?', a: 'No. Notary fees depend on the property (existing or new, its price and département), not on the buyer’s nationality or residence.' }
];

function buildGuidePagesEn(baseUrl) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) throw new Error('Guide pages require a real SITE_BASE_URL.');
  const secs = sections(base);
  const title = 'Buying property in France as a foreigner: steps, costs and taxes (2026) | Z Find';
  const description = 'Can foreigners buy in France? The buying process from offer to deed, notary fees, mortgages for non-residents, property and capital gains taxes, inheritance — a practical 2026 guide.';
  const canonical = base + PATH;
  const lds = [
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Z Find', item: base + '/' },
      { '@type': 'ListItem', position: 2, name: 'Buying property in France', item: canonical }
    ] },
    { '@context': 'https://schema.org', '@type': 'Article', headline: 'Buying property in France as a foreigner', inLanguage: 'en', url: canonical, dateModified: '2026-10-29', author: { '@type': 'Organization', name: 'Z Find' }, publisher: { '@type': 'Organization', name: 'Z Find', logo: { '@type': 'ImageObject', url: `${base}/brand/z-find-logo-gold.png` } } },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }
  ];
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(seo.buildMetaDescription(description, 158))}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Z Find">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(seo.buildMetaDescription(description, 158))}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(base)}/brand/z-find-logo-gold.png">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary">
${lds.map(o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n')}
${seo.presentationHead()}
${STYLE}
<style>.zs-toc{margin:22px 0 0;padding:18px 22px;border:1px solid var(--zf-200);background:#fff}.zs-toc ol{margin:8px 0 0;padding-left:20px;line-height:1.9}.zs-toc a,.zs-section ol a,.zs-section ul a{color:var(--zf-gold-dark);font-weight:500}.zs-section ol li,.zs-section ul li{margin:8px 0}</style>
</head>
<body class="zf-seo-body">
<header class="zf-seo-site-header">
  <div class="zf-seo-wrap zf-seo-nav">
    <a class="zf-seo-brand" href="${base}/" aria-label="Z Find">Z <em>Find</em></a>
    <a class="zf-seo-nav-cta" href="${base}${EN_PAGES.notaire}">Notary fees calculator →</a>
  </div>
</header>
<main class="zf-seo-main">
  <div class="zf-seo-wrap">
    <nav class="zf-seo-breadcrumb" aria-label="Breadcrumb"><a href="${base}/">Z Find</a> / <span>Buying property in France</span></nav>
    <header class="zf-seo-hero">
      <p class="zf-seo-eyebrow">Guide · International buyers · Updated ${UPDATED}</p>
      <h1>Buying property in France as a foreigner</h1>
      <p class="zf-seo-lead">Who may buy, the steps from offer to deed, what it costs, a mortgage as a non-resident and the taxes of owning and selling — the practical guide for buyers living abroad.</p>
      <nav class="zs-toc" aria-label="Contents"><b>Contents</b><ol>${secs.map(s => `<li><a href="#${s.id}">${esc(s.h)}</a></li>`).join('')}<li><a href="#faq">Frequently asked questions</a></li></ol></nav>
    </header>
${secs.map(s => `    <section class="zs-section" id="${s.id}"><h2>${esc(s.h)}</h2>${s.html}</section>`).join('\n')}
    <section class="zs-section zs-faq" id="faq"><h2>Frequently asked questions</h2>${FAQ.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</section>
    <section class="zs-section"><h2>Tools and further reading</h2><ul class="zs-links"><li><a href="${base}${EN_PAGES.hub}">Property calculators</a></li><li><a href="${base}/fr/prix-immobilier/france">Prices per m² by commune (French)</a></li><li><a href="${base}${G}">French property glossary</a></li><li><a href="${base}/fr/guides/immobilier-france" hreflang="fr" lang="fr">Guide juridique complet (en français)</a></li></ul></section>
    <p class="zs-small" style="margin-top:30px">General information, up to date as of ${UPDATED}. It is not legal, tax or financial advice and does not replace a notary, lawyer or tax adviser.</p>
  </div>
</main>
</body>
</html>`;
  return [{ path: PATH, html }];
}

module.exports = { PATH, buildGuidePagesEn };
