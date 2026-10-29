/* ============================================================
   Z FIND — pages des simulateurs : crédit en Belgique et au Luxembourg,
   rentabilité de la location courte durée (France), rentabilité locative
   en Belgique et au Luxembourg, estimation (version anglaise).
   French and English pages, paired by hreflang:

     /fr/simulateur-pret-immobilier-belgique     /en/belgium-mortgage-calculator
     /fr/simulateur-pret-immobilier-luxembourg   /en/luxembourg-mortgage-calculator
     /fr/rentabilite-location-courte-duree       /en/short-term-rental-yield-calculator-france
     /fr/rentabilite-locative-belgique           /en/rental-yield-calculator-belgium
     /fr/rentabilite-locative-luxembourg         /en/rental-yield-calculator-luxembourg
     (/fr/estimation-immobiliere)                /en/property-valuation

   Mêmes modules de calcul que le site (acquisition-costs, credit-rates,
   credit-simulator) ; les règles de chaque marché sont celles, datées et
   sourcées, du simulateur de rentabilité (rental-yield.js COPY.rules).
   Sans taux de référence en cours de validité (Belgique aujourd'hui), le
   champ reste vide et aucun tableau de mensualités n'est publié.
   ============================================================ */
'use strict';

const costs = require('./acquisition-costs.js');
const rates = require('./credit-rates.js');
const credit = require('./credit-simulator.js');
const yieldCopy = require('./rental-yield.js').COPY;
const FR = require('./simulator-landing-pages.js');
const EN = require('./simulator-landing-pages-en.js');

const P = FR.PAGES;
const E = FR.EN_PAGES;

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const fmt = {
  fr: { nf: new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }), eur(v) { return `${this.nf.format(Math.round(v))} €`; }, rate(r) { return `${String(r).replace('.', ',')} %`; } },
  en: { nf: new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }), eur(v) { return `€${this.nf.format(Math.round(v))}`; }, rate(r) { return `${r}%`; } }
};

function ctx(locale) {
  const en = locale === 'en';
  const S = en ? EN._shared : FR._shared;
  return {
    en, f: fmt[locale], shell: S.shell, field: S.field, LABELS_JS: S.LABELS_JS,
    engine: FR._shared.engineScript() + (en ? EN._shared.EN_ENGINE : ''),
    table: FR._shared.table,
    t: (fr, enText) => (en ? enText : fr),
    spa: (route) => `/#/${locale}/${route}`
  };
}

function rulesList(market, mode, locale) {
  const r = yieldCopy[locale] && yieldCopy[locale].rules && yieldCopy[locale].rules[market] && yieldCopy[locale].rules[market][mode];
  return r && r.length ? `<ul>${r.map(x => `<li>${esc(x)}</li>`).join('')}</ul><p class="zs-small">${esc(yieldCopy[locale].checked || '')}</p>` : '';
}

/* ---------------- crédit : Belgique, Luxembourg ---------------- */
function pagePret(base, today, market, locale) {
  const c = ctx(locale); const { t, f } = c;
  const years = market === 'LU' ? [15, 20, 25, 30] : [15, 20, 25];
  const refs = years.map(y => rates.reference(market, y, today));
  const ref = refs.find(Boolean) || null;
  const ref25 = rates.reference(market, 25, today) || ref;
  const hasRates = refs.every(Boolean);
  const loans = [200000, 300000, 400000, 500000, 750000];
  const rows = hasRates ? loans.map(l => [f.eur(l)].concat(refs.map(r => f.eur(credit.payment({ loan: l, ratePct: r.ratePct, years: r.years, insurancePct: 0 }).monthly)))) : [];
  const country = market === 'BE' ? t('Belgique', 'Belgium') : 'Luxembourg';
  const inCountry = market === 'BE' ? t('en Belgique', 'in Belgium') : t('au Luxembourg', 'in Luxembourg');
  const src = rates.DATA.markets[market].source.name;
  const rateNote = ref25
    ? t(`Taux moyen ${f.rate(ref25.ratePct)} sur ${ref25.years} ans (${ref25.source.name}, ${rates.periodLabel(ref25.period, 'fr')}).`, `Average rate ${f.rate(ref25.ratePct)} over ${ref25.years} years (${ref25.source.name}, ${rates.periodLabel(ref25.period, 'en')}).`)
    : t(`Aucun taux moyen officiel récent n’est publié pour la Belgique (${src}) : indiquez le taux proposé par votre banque ou votre courtier.`, `No recent official average rate is published for Belgium (${src}): enter the rate offered by your bank or broker.`);
  const costsField = market === 'BE'
    ? `<div class="zs-field"><label for="f-region">${t('Région', 'Region')}</label><select id="f-region" name="region"><option value="WAL">${t('Wallonie', 'Wallonia')}</option><option value="VLG">${t('Flandre', 'Flanders')}</option><option value="BRU">${t('Bruxelles-Capitale', 'Brussels-Capital')}</option></select></div>`
    : `<div class="zs-field"><label for="f-buyers">${t('Acquéreurs', 'Buyers')}</label><select id="f-buyers" name="buyers"><option value="1">1</option><option value="2" selected>2</option></select></div>`;
  const ownLabel = market === 'BE' ? t('Seule habitation propre', 'My only own home') : t('Résidence principale (Bëllegen Akt)', 'Main residence (Bëllegen Akt)');
  const defaults = market === 'BE' ? { price: '350000', deposit: '50000' } : { price: '750000', deposit: '150000' };
  const faq = market === 'BE'
    ? [
        { q: t('Combien puis-je emprunter en Belgique ?', 'How much can I borrow in Belgium?'), a: t('La Banque nationale de Belgique demande aux banques de limiter les prêts dont la quotité dépasse 90 % de la valeur du bien (80 % pour un investissement locatif) ; en pratique, l’apport couvre au moins les frais d’achat (droits d’enregistrement et notaire). La mensualité reste en général sous un tiers des revenus nets.', 'The National Bank of Belgium asks banks to limit loans above 90% of the property value (80% for a buy-to-let); in practice your deposit covers at least the buying costs (registration duties and notary). The payment usually stays under a third of net income.') },
        { q: t('Les frais d’achat sont-ils financés ?', 'Are buying costs financed?'), a: t('Rarement : la plupart des banques demandent que l’apport couvre les droits d’enregistrement et les frais de notaire. Le simulateur les ajoute au montant emprunté si vous le souhaitez.', 'Rarely: most banks ask your deposit to cover the registration duties and notary fees. The calculator adds them to the loan if you wish.') }
      ]
    : [
        { q: t('Quel est le taux moyen d’un prêt immobilier au Luxembourg ?', 'What is the average mortgage rate in Luxembourg?'), a: hasRates ? `${refs.map(r => `${f.rate(r.ratePct)} ${t('sur', 'over')} ${r.years} ${t('ans', 'years')}`).join(', ')} (${ref.source.name}, ${rates.periodLabel(ref.period, locale)}).` : rateNote },
        { q: t('Les droits d’enregistrement sont-ils inclus ?', 'Are registration duties included?'), a: t('Oui, si vous cochez la case : 7 % du prix, diminués du crédit d’impôt Bëllegen Akt pour une résidence principale. Les honoraires du notaire s’y ajoutent.', 'Yes, if you tick the box: 7% of the price, less the Bëllegen Akt tax credit for a main residence. The notary’s fees come on top.') }
      ];
  const id = `calc-pret-${market.toLowerCase()}`;
  const body = `    <form class="zs-calc" id="${id}" novalidate>
      <h2>${esc(t(`Calculer ma mensualité ${inCountry}`, `Calculate my monthly payment ${inCountry}`))}</h2>
      <div class="zs-grid">${c.field('price', t('Prix du bien (€)', 'Property price (€)'), defaults.price)}${c.field('deposit', t('Apport (€)', 'Deposit (€)'), defaults.deposit)}
        <div class="zs-field"><label for="f-years">${t('Durée', 'Term')}</label><select id="f-years" name="years">${years.map(y => `<option value="${y}"${y === 25 ? ' selected' : ''}>${y} ${t('ans', 'years')}</option>`).join('')}</select></div>
        ${c.field('rate', t('Taux annuel (%)', 'Annual rate (%)'), ref25 ? (c.en ? String(ref25.ratePct) : String(ref25.ratePct).replace('.', ',')) : '')}${c.field('ins', t('Assurance (% / an)', 'Insurance (% / year)'), c.en ? '0.20' : '0,20')}${costsField}</div>
      <p class="zs-check" style="margin-top:14px"><input type="checkbox" id="f-own" name="own" checked><label for="f-own">${esc(ownLabel)}</label></p>
      <p class="zs-check"><input type="checkbox" id="f-costs" name="costs" checked><label for="f-costs">${esc(t('Ajouter les frais d’achat au financement', 'Add buying costs to the loan'))}</label></p>
      <div class="zs-out" data-out aria-live="polite"></div>
      <p class="zs-small">${esc(rateNote)}</p>
      <div class="zs-ctas"><a class="zf-seo-primary" href="${base}${c.spa(`simulator?market=${market}&amp;mode=payment`)}">${esc(t('Ouvrir le simulateur complet', 'Open the full calculator'))} →</a></div>
    </form>
    ${hasRates ? `<section class="zs-section"><h2>${esc(t('Mensualités selon le montant emprunté', 'Monthly payments by loan amount'))}</h2>${c.table([t('Montant emprunté', 'Loan')].concat(refs.map(r => `${r.years} ${t('ans', 'years')} (${f.rate(r.ratePct)})`)), rows)}<p class="zs-small">${esc(t('Hors assurance emprunteur.', 'Before borrower insurance.'))} ${esc(rateNote)}</p></section>` : ''}
    <section class="zs-section"><h2>${esc(t(`Frais d’achat ${inCountry}`, `Buying costs ${inCountry}`))}</h2><p>${esc(t('Le calcul des droits et frais suit les barèmes publics 2026.', 'Duties and costs follow the 2026 public scales.'))} <a href="${base}${c.en ? (market === 'BE' ? E.belgique : E.luxembourg) : (market === 'BE' ? P.belgique : P.luxembourg)}">${esc(t('Le détail des frais d’achat', 'Buying costs in detail'))}</a> · <a href="${base}${c.en ? (market === 'BE' ? E.rentBe : E.rentLu) : (market === 'BE' ? P.rentBe : P.rentLu)}">${esc(t('Rentabilité locative', 'Rental yield'))}</a></p></section>`;
  const estimate = market === 'BE'
    ? `ZS.c.estimate({country:'BE',price:p,region:ZS.val(f,'region'),ownHome:ZS.on(f,'own')})`
    : `ZS.c.estimate({country:'LU',price:p,ownHome:ZS.on(f,'own'),buyers:Number(ZS.val(f,'buyers'))})`;
  const script = `${c.engine}<script>ZS.bind('${id}',function(f){var p=ZS.num(f,'price'),d=ZS.num(f,'deposit'),y=Number(ZS.val(f,'years')),t=ZS.num(f,'rate'),i=ZS.num(f,'ins');if(!(p>0)||!(t>0))return '<p>${esc(t('Indiquez un prix et un taux.', 'Enter a price and a rate.'))}</p>';var e=${estimate};var c=ZS.on(f,'costs')&&!e.error?e.costs:0;var loan=Math.max(0,p+c-d);var m=loan*ZS.annuity(t,y),a=loan*i/100/12,n=y*12;return '<p class="zs-big">'+ZS.eur(m+a)+' ${esc(t('/ mois', '/ month'))}</p>'+ZS.lines([['${esc(t('Montant emprunté', 'Loan amount'))}',ZS.eur(loan)],['${esc(t('dont frais d’achat', 'of which buying costs'))}',ZS.eur(c)],['${esc(t('Mensualité hors assurance', 'Payment before insurance'))}',ZS.eur(m)],['${esc(t('Assurance', 'Insurance'))}',ZS.eur(a)],['${esc(t('Coût des intérêts', 'Interest cost'))}',ZS.eur(m*n-loan)]]);});</script>`;
  const pathName = c.en ? (market === 'BE' ? E.pretBe : E.pretLu) : (market === 'BE' ? P.pretBe : P.pretLu);
  return { path: pathName, html: c.shell({
    base, pathName, crumb: t(`Prêt immobilier ${inCountry}`, `Mortgage ${inCountry}`), eyebrow: t(`Simulateur gratuit · ${country} 2026`, `Free calculator · ${country} 2026`),
    title: t(`Simulateur de prêt immobilier ${inCountry} 2026 : mensualité | Z Find`, `${country} mortgage calculator 2026: monthly payment | Z Find`),
    description: t(`Calculez la mensualité d’un prêt immobilier ${inCountry} : coût du crédit, assurance et frais d’achat ${market === 'BE' ? 'de votre région' : '(7 % et Bëllegen Akt)'} inclus${ref25 ? `, au taux moyen de ${f.rate(ref25.ratePct)} sur ${ref25.years} ans` : ''}.`, `Calculate a mortgage payment ${inCountry}: loan cost, insurance and buying costs ${market === 'BE' ? 'of your region' : '(7% and Bëllegen Akt)'} included${ref25 ? `, at the average rate of ${f.rate(ref25.ratePct)} over ${ref25.years} years` : ''}.`),
    h1: t(`Simulateur de prêt immobilier ${inCountry}`, `${country} mortgage calculator`),
    lead: t(`Mensualité, coût du crédit et frais d’achat d’un projet ${inCountry}${ref25 ? ', avec le dernier taux moyen publié' : ''}.`, `Monthly payment, loan cost and buying costs of a project ${inCountry}${ref25 ? ', with the latest published average rate' : ''}.`),
    body, faq, scripts: script
  }) };
}

/* ---------------- rentabilité : courte durée (FR), Belgique, Luxembourg ---------------- */
function pageCourte(base, locale) {
  const c = ctx(locale); const { t } = c;
  const faq = [
    { q: t('Comment calculer la rentabilité d’une location courte durée ?', 'How do I calculate the yield of a short-term let?'), a: t('Revenus annuels = prix moyen par nuit × nombre de nuits louées (taux d’occupation × 365). Retirez les commissions des plateformes, le ménage, l’énergie, la taxe foncière, les charges, l’assurance et l’entretien, puis divisez par le coût total (prix, frais de notaire, travaux, mobilier).', 'Annual income = average nightly rate × nights let (occupancy × 365). Deduct platform fees, cleaning, energy, property tax, charges, insurance and upkeep, then divide by the total cost (price, notary fees, works, furniture).') },
    { q: t('Combien de nuits par an peut-on louer sa résidence principale ?', 'How many nights a year can I let my main residence?'), a: t('120 jours par an au plus, ou 90 si la commune l’a décidé. Une résidence secondaire n’a pas cette limite, mais peut exiger une autorisation de changement d’usage dans certaines communes.', 'At most 120 days a year, or 90 if the commune has decided so. A second home has no such limit but may need a change-of-use authorisation in some communes.') }
  ];
  const body = `    <form class="zs-calc" id="calc-court" novalidate>
      <h2>${esc(t('Calculer la rentabilité de ma location courte durée', 'Calculate the yield of my short-term let'))}</h2>
      <div class="zs-grid">${c.field('price', t('Prix d’achat (€)', 'Purchase price (€)'), '220000')}${c.field('works', t('Travaux et mobilier (€)', 'Works and furniture (€)'), '15000')}${c.field('night', t('Prix moyen par nuit (€)', 'Average nightly rate (€)'), '95')}${c.field('occ', t('Taux d’occupation (%)', 'Occupancy (%)'), '55')}${c.field('fee', t('Commission des plateformes (%)', 'Platform fees (%)'), '15')}${c.field('clean', t('Ménage, linge, consommables (€ / an)', 'Cleaning, linen, supplies (€ / year)'), '3000')}${c.field('util', t('Énergie, internet (€ / an)', 'Energy, internet (€ / year)'), '1800')}${c.field('other', t('Taxe foncière, charges, assurance, entretien (€ / an)', 'Property tax, charges, insurance, upkeep (€ / year)'), '2500')}</div>
      <div class="zs-out" data-out aria-live="polite"></div>
      <div class="zs-ctas"><a class="zf-seo-primary" href="${base}${c.spa('yield?market=FR&amp;mode=short')}">${esc(t('Simulateur complet (crédit, cash-flow)', 'Full calculator (loan, cash flow)'))} →</a></div>
    </form>
    <section class="zs-section"><h2>${esc(t('Les règles de la location courte durée en France', 'Short-term letting rules in France'))}</h2>${rulesList('FR', 'short', locale)}</section>
    <section class="zs-section"><h2>${esc(t('Comparer avec une location classique', 'Compare with a long-term let'))}</h2><p><a href="${base}${c.en ? E.rentabilite : P.rentabilite}">${esc(t('Rentabilité d’une location longue durée', 'Yield of a long-term let'))}</a> · <a href="${base}${c.en ? E.notaire : P.notaire}">${esc(t('Frais de notaire', 'Notary fees'))}</a></p></section>`;
  const script = `${c.engine}<script>ZS.bind('calc-court',function(f){var p=ZS.num(f,'price'),w=ZS.num(f,'works'),nt=ZS.num(f,'night'),o=ZS.num(f,'occ')/100,fe=ZS.num(f,'fee')/100,ch=ZS.num(f,'clean')+ZS.num(f,'util')+ZS.num(f,'other');if(!(p>0)||!(nt>0)||!(o>0))return '<p>${esc(t('Indiquez le prix, le prix par nuit et l’occupation.', 'Enter the price, nightly rate and occupancy.'))}</p>';var gross=nt*365*o,net=gross*(1-fe),c=ZS.c.estimate({country:'FR',price:p}).costs,inv=p+c+w;var pc=function(v){return (v*100).toFixed(2)${c.en ? "+'%'" : ".replace('.',',')+' %'"};};return '<p class="zs-big">'+pc((net-ch)/inv)+' ${esc(t('net', 'net'))}</p><p>'+pc(gross/p)+' ${esc(t('brut', 'gross'))}</p>'+ZS.lines([['${esc(t('Nuits louées par an', 'Nights let a year'))}',Math.round(365*o)],['${esc(t('Réservations annuelles', 'Annual bookings'))}',ZS.eur(gross)],['${esc(t('Après commissions', 'After platform fees'))}',ZS.eur(net)],['${esc(t('Charges annuelles', 'Annual charges'))}',ZS.eur(ch)],['${esc(t('Frais de notaire', 'Notary fees'))}',ZS.eur(c)],['${esc(t('Résultat avant crédit et impôt', 'Result before loan and tax'))}',ZS.eur(net-ch)]]);});</script>`;
  const pathName = c.en ? E.courte : P.courte;
  return { path: pathName, html: c.shell({
    base, pathName, crumb: t('Location courte durée', 'Short-term rental'), eyebrow: t('Simulateur gratuit · Meublé de tourisme', 'Free calculator · Holiday let'),
    title: t('Rentabilité location courte durée (Airbnb) : simulateur gratuit 2026 | Z Find', 'Short-term rental yield calculator France (holiday let) 2026 | Z Find'),
    description: t('Calculez la rentabilité d’un meublé de tourisme : prix par nuit, taux d’occupation, commissions, ménage et charges, frais de notaire inclus. Règles 2026 : enregistrement, 120 jours, DPE.', 'Calculate the yield of a holiday let in France: nightly rate, occupancy, platform fees, cleaning and charges, notary fees included. 2026 rules: registration, 120 days, energy rating.'),
    h1: t('Rentabilité d’une location courte durée', 'Short-term rental yield calculator (France)'),
    lead: t('Rendement brut et net d’un meublé de tourisme, avec vos propres hypothèses de prix et d’occupation, et les règles 2026.', 'Gross and net yield of a holiday let in France, from your own rate and occupancy assumptions, with the 2026 rules.'),
    body, faq, scripts: script
  }) };
}

function pageRentMarket(base, market, locale) {
  const c = ctx(locale); const { t } = c;
  const inCountry = market === 'BE' ? t('en Belgique', 'in Belgium') : t('au Luxembourg', 'in Luxembourg');
  const country = market === 'BE' ? t('Belgique', 'Belgium') : 'Luxembourg';
  const id = `calc-rent-${market.toLowerCase()}`;
  const regionField = market === 'BE' ? `<div class="zs-field"><label for="f-region">${t('Région', 'Region')}</label><select id="f-region" name="region"><option value="WAL">${t('Wallonie', 'Wallonia')}</option><option value="VLG">${t('Flandre', 'Flanders')}</option><option value="BRU">${t('Bruxelles-Capitale', 'Brussels-Capital')}</option></select></div>` : '';
  const def = market === 'BE' ? { price: '280000', rent: '1050', tax: '900' } : { price: '650000', rent: '2200', tax: '200' };
  const faq = market === 'BE'
    ? [{ q: t('Quels frais d’achat pour un investissement locatif en Belgique ?', 'What buying costs for a buy-to-let in Belgium?'), a: t('Le taux réduit de l’habitation propre ne s’applique pas : 12,5 % de droits d’enregistrement en Wallonie et à Bruxelles, 12 % en Flandre, plus les honoraires du notaire.', 'The reduced own-home rate does not apply: 12.5% registration duties in Wallonia and Brussels, 12% in Flanders, plus the notary’s fees.') },
       { q: t('Comment sont imposés les loyers en Belgique ?', 'How is rental income taxed in Belgium?'), a: t('Pour un logement loué à un particulier qui y habite, en principe sur le revenu cadastral indexé majoré de 40 %, et non sur le loyer réel.', 'For a home let to a private tenant who lives there, in principle on the indexed cadastral income plus 40%, not on the actual rent.') }]
    : [{ q: t('Quel loyer maximum au Luxembourg ?', 'What is the maximum rent in Luxembourg?'), a: t('Le loyer annuel d’un logement non meublé ne peut dépasser 5 % du capital investi (prix, frais d’acte et travaux, réévalués et décotés pour vétusté).', 'The annual rent of an unfurnished home may not exceed 5% of the capital invested (price, deed costs and works, revalued and reduced for age).') },
       { q: t('Le Bëllegen Akt s’applique-t-il ?', 'Does the Bëllegen Akt apply?'), a: t('Non : le crédit d’impôt est réservé à la résidence principale ; un investissement locatif paie les 7 % de droits.', 'No: the tax credit is for a main residence only; a buy-to-let pays the full 7% duties.') }];
  const body = `    <form class="zs-calc" id="${id}" novalidate>
      <h2>${esc(t(`Calculer la rentabilité ${inCountry}`, `Calculate the yield ${inCountry}`))}</h2>
      <div class="zs-grid">${c.field('price', t('Prix d’achat (€)', 'Purchase price (€)'), def.price)}${regionField}${c.field('works', t('Travaux (€)', 'Works (€)'), '0')}${c.field('rent', t('Loyer mensuel hors charges (€)', 'Monthly rent excl. charges (€)'), def.rent)}${c.field('tax', market === 'BE' ? t('Précompte immobilier (€ / an)', 'Property withholding tax (€ / year)') : t('Impôt foncier (€ / an)', 'Land tax (€ / year)'), def.tax)}${c.field('other', t('Charges, assurance, entretien (€ / an)', 'Charges, insurance, upkeep (€ / year)'), '1200')}</div>
      <div class="zs-out" data-out aria-live="polite"></div>
      <div class="zs-ctas"><a class="zf-seo-primary" href="${base}${c.spa(`yield?market=${market}&amp;mode=long`)}">${esc(t('Simulateur complet (crédit, cash-flow)', 'Full calculator (loan, cash flow)'))} →</a></div>
    </form>
    <section class="zs-section"><h2>${esc(t(`À savoir avant d’investir ${inCountry}`, `Good to know before investing ${inCountry}`))}</h2>${rulesList(market, 'long', locale)}</section>
    <section class="zs-section"><h2>${esc(t('Financer l’achat', 'Financing the purchase'))}</h2><p><a href="${base}${c.en ? (market === 'BE' ? E.pretBe : E.pretLu) : (market === 'BE' ? P.pretBe : P.pretLu)}">${esc(t(`Prêt immobilier ${inCountry}`, `Mortgage ${inCountry}`))}</a> · <a href="${base}${c.en ? (market === 'BE' ? E.belgique : E.luxembourg) : (market === 'BE' ? P.belgique : P.luxembourg)}">${esc(t('Frais d’achat', 'Buying costs'))}</a></p></section>`;
  const est = market === 'BE' ? `ZS.c.estimate({country:'BE',price:p,region:ZS.val(f,'region'),ownHome:false})` : `ZS.c.estimate({country:'LU',price:p,ownHome:false})`;
  const cap = market === 'LU' ? `,['${esc(t('Plafond légal du loyer (5 %, indicatif)', 'Legal rent ceiling (5%, indicative)'))}',ZS.eur((p+c+w)*0.05/12)+'${esc(t(' / mois', ' / month'))}']` : '';
  const script = `${c.engine}<script>ZS.bind('${id}',function(f){var p=ZS.num(f,'price'),w=ZS.num(f,'works'),r=ZS.num(f,'rent')*12,ch=ZS.num(f,'tax')+ZS.num(f,'other');if(!(p>0)||!(r>0))return '<p>${esc(t('Indiquez un prix et un loyer.', 'Enter a price and a rent.'))}</p>';var e=${est};var c=e.error?0:e.costs,inv=p+c+w;var pc=function(v){return (v*100).toFixed(2)${c.en ? "+'%'" : ".replace('.',',')+' %'"};};return '<p class="zs-big">'+pc((r-ch)/inv)+' ${esc(t('net', 'net'))}</p><p>'+pc(r/p)+' ${esc(t('brut', 'gross'))}</p>'+ZS.lines([['${esc(t('Loyers annuels', 'Annual rent'))}',ZS.eur(r)],['${esc(t('Charges annuelles', 'Annual charges'))}',ZS.eur(ch)],['${esc(t('Frais d’achat (investissement)', 'Buying costs (buy-to-let)'))}',ZS.eur(c)],['${esc(t('Investissement total', 'Total investment'))}',ZS.eur(inv)]${cap}]);});</script>`;
  const pathName = c.en ? (market === 'BE' ? E.rentBe : E.rentLu) : (market === 'BE' ? P.rentBe : P.rentLu);
  return { path: pathName, html: c.shell({
    base, pathName, crumb: t(`Rentabilité locative ${inCountry}`, `Rental yield ${inCountry}`), eyebrow: t(`Simulateur gratuit · ${country}`, `Free calculator · ${country}`),
    title: t(`Rentabilité locative ${inCountry} : simulateur gratuit 2026 | Z Find`, `Rental yield calculator ${inCountry} 2026 | Z Find`),
    description: t(`Calculez le rendement brut et net d’un investissement locatif ${inCountry} : loyers, ${market === 'BE' ? 'précompte immobilier' : 'impôt foncier'}, charges et frais d’achat d’un investissement${market === 'LU' ? ', plafond légal du loyer' : ''}.`, `Calculate the gross and net yield of a buy-to-let ${inCountry}: rent, ${market === 'BE' ? 'property withholding tax' : 'land tax'}, charges and buy-to-let purchase costs${market === 'LU' ? ', legal rent ceiling' : ''}.`),
    h1: t(`Rentabilité locative ${inCountry}`, `Rental yield calculator ${inCountry}`),
    lead: t(`Rendement brut et net de votre investissement ${inCountry}, frais d’achat d’un investissement locatif compris, et les règles à connaître.`, `Gross and net yield of your investment ${inCountry}, with buy-to-let purchase costs and the rules to know.`),
    body, faq, scripts: script
  }) };
}

/* ---------------- valuation (English) ---------------- */
function pageEstimationEn(base) {
  const c = ctx('en');
  const faq = [
    { q: 'How do I value my home in France for free?', a: 'Enter the commune, the floor area and the features of the property: Z Find shows a price range at once, from the official sales of the commune (DVF), with no sign-up.' },
    { q: 'Where do the prices come from?', a: 'From sales registered by the French tax administration (DVF, DGFiP) in France, and official statistics in Belgium and Luxembourg.' }
  ];
  const body = `    <section class="zs-cards">
      <a class="zs-card" href="${base}${c.spa('estimation?market=FR&amp;mode=owner')}"><h2>Value my home →</h2><p>Owner: an instant price range for your flat or house.</p></a>
      <a class="zs-card" href="${base}${c.spa('estimation?market=FR&amp;mode=buyer')}"><h2>Check an asking price →</h2><p>Buyer: compare the asking price with real sales in the commune before making an offer.</p></a>
      <a class="zs-card" href="${base}/fr/prix-immobilier/france"><h2>Prices per m² by commune →</h2><p>Median prices of flats and houses, commune by commune (French).</p></a>
    </section>
    <section class="zs-section"><h2>How the Z Find valuation works</h2><p>It starts from the median price per m² of real sales in the commune, then adjusts for the type of property, floor area, floor, condition and outdoor space. The result is a range, never a single price: the honest way to describe a market.</p><p>Then calculate the <a href="${base}${E.notaire}">notary fees</a>, your <a href="${base}${E.capacite}">borrowing capacity</a> or the <a href="${base}${E.rentabilite}">rental yield</a>.</p></section>`;
  return { path: E.estimation, html: c.shell({
    base, pathName: E.estimation, crumb: 'Property valuation', eyebrow: 'Free · No sign-up · France, Belgium, Luxembourg',
    title: 'Free online property valuation in France: flat and house | Z Find',
    description: 'Value a flat or a house in France, Belgium or Luxembourg for free: an instant price range from official sales, no sign-up.',
    h1: 'Free property valuation', lead: 'An instant price range from the official sale prices of the commune, with no sign-up.',
    body, faq
  }) };
}

function buildMarketPages(base, today, locale) {
  const pages = [pagePret(base, today, 'BE', locale), pagePret(base, today, 'LU', locale), pageCourte(base, locale), pageRentMarket(base, 'BE', locale), pageRentMarket(base, 'LU', locale)];
  if (locale === 'en') pages.push(pageEstimationEn(base));
  return pages;
}

module.exports = { buildMarketPages };
