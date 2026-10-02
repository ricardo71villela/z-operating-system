/* ============================================================
   Z FIND — ESTIMATION PAGE (#/{lang}/estimation?market=FR&mode=owner)

   Two entry points on one tool:
     owner  "Estimer mon bien"   — indicative value of a property
     buyer  "Vérifier un prix"   — where an asking price sits in the range
   The range is shown immediately, without asking for anything. The
   detailed report is e-mailed on request (e-mail + consent), through
   /api/estimation, which recomputes the figures server-side and sends the
   report to the visitor and a lead notification to Z Find.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./estimation'));
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.estimationPage = factory(root.ZFindServices.estimation);
  }
})(typeof window !== 'undefined' ? window : this, function (engine) {
  'use strict';

  const API = '/api/estimation';
  const DATA_CONTACT = 'hello@zfind.online';

  const COPY = Object.freeze({
    fr: Object.freeze({
      eyebrow: 'Estimation immobilière gratuite',
      title: 'Combien vaut ce bien ?',
      lead: 'Une fourchette de prix immédiate, calculée à partir des prix de vente officiels de la commune — sans inscription.',
      modeOwner: 'Estimer mon bien', modeBuyer: 'Vérifier un prix',
      markets: { FR: 'France', BE: 'Belgique', LU: 'Luxembourg' },
      introTitle: 'Comment ça marche',
      introSteps: {
        owner: ['Indiquez la commune, le type et la surface de votre bien.', 'Z Find part des prix de vente officiels de la commune, puis ajuste selon l’état, le DPE et les atouts.', 'Vous obtenez une fourchette, une valeur centrale et un niveau de fiabilité — et, si vous le souhaitez, le rapport détaillé par e-mail.'],
        buyer: ['Indiquez la commune, le type, la surface et le prix demandé.', 'Z Find calcule la fourchette du marché à partir des ventes officielles de la commune.', 'Vous voyez tout de suite si le prix est sous, dans ou au-dessus de la fourchette.']
      },
      introSourceLabel: 'Données officielles',
      introSources: { FR: 'DVF — ventes enregistrées par la DGFiP', BE: 'Statbel — actes de vente (SPF Finances)', LU: 'Observatoire de l’Habitat — ministère du Logement' },
      introPoints: ['Gratuit', 'Sans inscription', 'Résultat immédiat'],
      introNote: 'Estimation statistique indicative : elle ne remplace pas l’avis de valeur d’un professionnel qui visite le bien.',
      commune: 'Commune ou code postal', communePh: 'ex. Évian-les-Bains ou 74500', communeHint: 'Choisissez une commune dans la liste.',
      type: 'Type de bien',
      types: { apartment: 'Appartement', house: 'Maison', house_closed: 'Maison 2-3 façades (mitoyenne)', house_open: 'Maison 4 façades (isolée)' },
      typesSales: { apartment: 'ventes d’appartements', house: 'ventes de maisons', house_closed: 'ventes de maisons 2-3 façades', house_open: 'ventes de maisons 4 façades' },
      surface: 'Surface habitable (m²)',
      condition: 'État', conditions: { to_renovate: 'À rénover', standard: 'Correct', good: 'Bon état', renovated: 'Refait à neuf' },
      energy: { FR: 'DPE', BE: 'PEB', LU: 'Classe énergétique' }, energyUnknown: 'Je ne sais pas',
      newBuild: 'Appartement neuf (VEFA)',
      features: 'Atouts', f: { balcony: 'Balcon', terrace: 'Terrasse', garden: 'Jardin', parking: 'Parking / garage', pool: 'Piscine', view: 'Vue dégagée' },
      floor: 'Étage', floorGround: 'Rez-de-chaussée', lift: 'Ascenseur',
      asking: 'Prix demandé (€)',
      submit: 'Estimer', submitBuyer: 'Vérifier le prix', computing: 'Calcul…',
      resultTitle: 'Estimation indicative', perM2: '/m²', centralLabel: 'Valeur centrale', colon: ' : ',
      confidence: { high: 'Fiabilité élevée', medium: 'Fiabilité moyenne', low: 'Fiabilité limitée' },
      basis: (b, typeLabel) => {
        const where = b.level === 'commune' ? `à ${b.name}` : b.level === 'department' ? `dans le département ${b.name}`
          : b.level === 'canton' ? `dans le canton ${/^[aeiouyhéèê]/i.test(b.name) ? 'd’' : 'de '}${b.name}` : b.level === 'country' ? `au ${b.name}` : `dans la zone « ${b.name} »`;
        const n = b.n ? `${b.n.toLocaleString('fr-FR')} ` : '';
        const what = b.segment === 'advertised_houses' ? 'annonces de maisons' : typeLabel;
        return `Calculé à partir ${n ? `de ${n}${what}` : `des ${what}`} ${where}, période ${engine.formatPeriod(b.period, 'fr')}.`;
      },
      adjTitle: 'Ajustements appliqués',
      adj: { condition: 'État', energy: 'Performance énergétique', outdoor: 'Extérieur', parking: 'Stationnement', pool: 'Piscine', view: 'Vue', ground_floor: 'Rez-de-chaussée', high_floor_no_lift: 'Étage élevé sans ascenseur',
        position: 'Emplacement et standing (position dans les prix de la commune)', era: 'Époque de construction', light: 'Luminosité', land: 'Terrain', top_floor: 'Dernier étage', cellar: 'Cave', nuisance: 'Nuisances' },
      refineTitle: 'Affiner l’estimation',
      refineLead: 'Quelques questions de plus pour une fourchette plus resserrée. Répondez seulement à ce que vous savez.',
      refineUnknown: '—',
      refineFields: {
        location: { label: 'Emplacement dans la commune', options: { less_sought: 'Excentré ou peu recherché', standard: 'Courant', sought: 'Résidentiel recherché', prime: 'Très prisé (bord de lac, centre historique, meilleur quartier)' } },
        view: { label: 'Vue', options: { none: 'Sans vue particulière', open: 'Dégagée', mountain: 'Montagne', lake_partial: 'Lac (partielle)', lake: 'Lac (panoramique)' } },
        standing: { label: 'Standing du bien et de l’immeuble', options: { modest: 'Modeste', standard: 'Courant', high: 'Haut de gamme', prestige: 'Prestige' } },
        era: { label: 'Époque de construction', options: { pre1950: 'Avant 1950', '1950_1980': '1950 – 1980', '1980_2010': '1980 – 2010', post2010: 'Après 2010' } },
        light: { label: 'Luminosité', options: { dark: 'Sombre', standard: 'Normale', bright: 'Très lumineux' } },
        parking: { label: 'Stationnement', options: { none: 'Aucun', outdoor: 'Place extérieure', garage: 'Garage ou box fermé', double_garage: 'Double garage' } }
      },
      refineOutdoorArea: 'Balcon, terrasse ou jardin (m²)', refineLandArea: 'Surface du terrain (m²)',
      refineTopFloor: 'Dernier étage', refineCellar: 'Cave', refineNuisance: 'Nuisances (route passante, vis-à-vis, bruit)',
      refineSubmit: 'Recalculer',
      refineDone: n => `Estimation affinée avec ${n} réponse${n > 1 ? 's' : ''} supplémentaire${n > 1 ? 's' : ''}.`,
      adjNone: 'Aucun ajustement : bien comparé à la médiane de la zone.',
      beNote: s => `En Belgique, les prix publiés sont des prix totaux (pas au m²) : la surface est comparée à une surface de référence de ${s} m² pour ce type de bien.`,
      luHouseNote: r => `Au Luxembourg, les prix de vente des maisons ne sont pas publiés par commune : estimation à partir des prix annoncés, corrigés de l’écart constaté entre prix annoncés et prix de vente (${Math.round(r * 100)} %).`,
      buyer: { below: d => `Le prix demandé est ${d} sous la fourchette estimée.`, within: 'Le prix demandé est dans la fourchette estimée.', above: d => `Le prix demandé est ${d} au-dessus de la valeur centrale estimée.` },
      disclaimer: 'Estimation statistique indicative, fondée sur des données publiques agrégées. Elle ne remplace pas l’avis de valeur d’un professionnel qui visite le bien.',
      source: 'Source',
      errors: { commune: 'Choisissez une commune dans la liste.', type: 'Choisissez un type de bien.', surface: 'Indiquez une surface entre 9 et 2 000 m².', askingPrice: 'Indiquez un prix entre 10 000 € et 50 000 000 €.', no_data: 'Pas assez de ventes publiées dans cette zone pour une estimation fiable.', not_under_dvf: 'Les ventes du Bas-Rhin, du Haut-Rhin, de la Moselle et de Mayotte ne sont pas publiées dans la base DVF : estimation indisponible pour ce secteur.', generic: 'Estimation momentanément indisponible. Réessayez dans un instant.' },
      reportTitle: 'Recevez le rapport détaillé',
      reportLead: 'Par e-mail : la fourchette, le détail du calcul, les prix de la commune et leur évolution.',
      name: 'Nom (facultatif)', email: 'E-mail', phone: 'Téléphone (facultatif)',
      project: 'Votre projet',
      projectsOwner: { sell_3m: 'Vendre dans les 3 mois', sell_12m: 'Vendre dans l’année', later: 'Plus tard', curious: 'Simple curiosité' },
      projectsBuyer: { buy_3m: 'Acheter dans les 3 mois', buy_12m: 'Acheter dans l’année', looking: 'Je me renseigne' },
      alerts: 'J’accepte de recevoir par e-mail la nouvelle estimation de mon bien à chaque mise à jour officielle des prix. Désinscription en un clic dans chaque e-mail.',
      alertPending: 'Pour activer l’alerte de valeur, cliquez sur le lien de confirmation reçu par e-mail.',
      consent: 'J’accepte que Z Find utilise ces informations pour m’envoyer ce rapport et me recontacter au sujet de mon projet immobilier.',
      rgpd: 'Données utilisées uniquement pour ce rapport et le suivi de votre demande ; elles ne sont ni vendues ni cédées. Pour y accéder, les rectifier ou les supprimer :',
      send: 'Envoyer le rapport', sending: 'Envoi…',
      sent: e => `C’est envoyé. Vérifiez votre boîte de réception (${e}).`,
      sendErrors: { email: 'Indiquez une adresse e-mail valide.', consent: 'Cochez la case de consentement pour recevoir le rapport.', phone: 'Numéro de téléphone invalide.', generic: 'L’envoi n’a pas abouti. Réessayez dans un instant.' }
    }),
    en: Object.freeze({
      eyebrow: 'Free property valuation',
      title: 'What is this property worth?',
      lead: 'An instant price range, based on the official sale prices of the municipality — no sign-up.',
      modeOwner: 'Value my property', modeBuyer: 'Check a price',
      markets: { FR: 'France', BE: 'Belgium', LU: 'Luxembourg' },
      introTitle: 'How it works',
      introSteps: {
        owner: ['Enter the municipality, type and area of your property.', 'Z Find starts from the official sale prices of the municipality, then adjusts for condition, energy rating and features.', 'You get a range, a central value and a reliability level — and, if you wish, the detailed report by e-mail.'],
        buyer: ['Enter the municipality, type, area and asking price.', 'Z Find computes the market range from the official sales of the municipality.', 'You see at once whether the price is below, within or above the range.']
      },
      introSourceLabel: 'Official data',
      introSources: { FR: 'DVF — sales recorded by the French tax authority (DGFiP)', BE: 'Statbel — deeds of sale (FPS Finance)', LU: 'Observatoire de l’Habitat — Ministry of Housing' },
      introPoints: ['Free', 'No sign-up', 'Instant result'],
      introNote: 'Indicative statistical estimate: it does not replace a valuation by a professional who visits the property.',
      commune: 'Municipality or postcode', communePh: 'e.g. Évian-les-Bains or 74500', communeHint: 'Choose a municipality from the list.',
      type: 'Property type',
      types: { apartment: 'Apartment', house: 'House', house_closed: 'House, 2-3 façades (terraced/semi)', house_open: 'House, 4 façades (detached)' },
      typesSales: { apartment: 'apartment sales', house: 'house sales', house_closed: '2-3-façade house sales', house_open: '4-façade house sales' },
      surface: 'Living area (m²)',
      condition: 'Condition', conditions: { to_renovate: 'Needs renovation', standard: 'Fair', good: 'Good', renovated: 'Fully renovated' },
      energy: { FR: 'EPC (DPE)', BE: 'EPC (PEB)', LU: 'Energy class' }, energyUnknown: 'I don’t know',
      newBuild: 'New-build apartment (off-plan)',
      features: 'Features', f: { balcony: 'Balcony', terrace: 'Terrace', garden: 'Garden', parking: 'Parking / garage', pool: 'Pool', view: 'Open view' },
      floor: 'Floor', floorGround: 'Ground floor', lift: 'Lift',
      asking: 'Asking price (€)',
      submit: 'Get estimate', submitBuyer: 'Check the price', computing: 'Calculating…',
      resultTitle: 'Indicative estimate', perM2: '/m²', centralLabel: 'Central value', colon: ': ',
      confidence: { high: 'High reliability', medium: 'Medium reliability', low: 'Limited reliability' },
      basis: (b, typeLabel) => {
        const where = b.level === 'country' ? `in ${b.name}` : b.level === 'canton' ? `in the canton of ${b.name}` : `in ${b.name}`;
        const n = b.n ? `${b.n.toLocaleString('en-IE')} ` : '';
        return `Based on ${n}${b.segment === 'advertised_houses' ? 'house adverts' : typeLabel} ${where}, period ${engine.formatPeriod(b.period, 'en')}.`;
      },
      adjTitle: 'Adjustments applied',
      adj: { condition: 'Condition', energy: 'Energy performance', outdoor: 'Outdoor space', parking: 'Parking', pool: 'Pool', view: 'View', ground_floor: 'Ground floor', high_floor_no_lift: 'High floor without lift',
        position: 'Location and standard (position within local prices)', era: 'Construction period', light: 'Natural light', land: 'Plot', top_floor: 'Top floor', cellar: 'Cellar', nuisance: 'Nuisances' },
      refineTitle: 'Refine the estimate',
      refineLead: 'A few more questions for a narrower range. Only answer what you know.',
      refineUnknown: '—',
      refineFields: {
        location: { label: 'Location within the municipality', options: { less_sought: 'Outlying or less sought-after', standard: 'Average', sought: 'Sought-after residential', prime: 'Prime (lakefront, historic centre, best area)' } },
        view: { label: 'View', options: { none: 'No particular view', open: 'Open', mountain: 'Mountains', lake_partial: 'Lake (partial)', lake: 'Lake (panoramic)' } },
        standing: { label: 'Standard of the property and building', options: { modest: 'Modest', standard: 'Average', high: 'High-end', prestige: 'Prestige' } },
        era: { label: 'Construction period', options: { pre1950: 'Before 1950', '1950_1980': '1950 – 1980', '1980_2010': '1980 – 2010', post2010: 'After 2010' } },
        light: { label: 'Natural light', options: { dark: 'Dark', standard: 'Normal', bright: 'Very bright' } },
        parking: { label: 'Parking', options: { none: 'None', outdoor: 'Outdoor space', garage: 'Garage or closed box', double_garage: 'Double garage' } }
      },
      refineOutdoorArea: 'Balcony, terrace or garden (m²)', refineLandArea: 'Plot size (m²)',
      refineTopFloor: 'Top floor', refineCellar: 'Cellar', refineNuisance: 'Nuisances (busy road, overlooked, noise)',
      refineSubmit: 'Recalculate',
      refineDone: n => `Estimate refined with ${n} extra answer${n > 1 ? 's' : ''}.`,
      adjNone: 'No adjustment: property compared with the area median.',
      beNote: s => `In Belgium, published prices are total prices (not per m²): the living area is compared with a reference area of ${s} m² for this property type.`,
      luHouseNote: r => `In Luxembourg, house sale prices are not published by municipality: estimate based on advertised prices, corrected by the observed gap between advertised and sale prices (${Math.round(r * 100)}%).`,
      buyer: { below: d => `The asking price is ${d} below the estimated range.`, within: 'The asking price is within the estimated range.', above: d => `The asking price is ${d} above the estimated central value.` },
      disclaimer: 'Indicative statistical estimate based on aggregated public data. It does not replace a valuation by a professional who visits the property.',
      source: 'Source',
      errors: { commune: 'Choose a municipality from the list.', type: 'Choose a property type.', surface: 'Enter an area between 9 and 2,000 m².', askingPrice: 'Enter a price between €10,000 and €50,000,000.', no_data: 'Not enough published sales in this area for a reliable estimate.', not_under_dvf: 'Sales in Bas-Rhin, Haut-Rhin, Moselle and Mayotte are not published in the DVF database: no estimate for this area.', generic: 'Estimate temporarily unavailable. Please try again shortly.' },
      reportTitle: 'Get the detailed report',
      reportLead: 'By e-mail: the range, how it was calculated, and local prices over time.',
      name: 'Name (optional)', email: 'E-mail', phone: 'Phone (optional)',
      project: 'Your plans',
      projectsOwner: { sell_3m: 'Sell within 3 months', sell_12m: 'Sell within a year', later: 'Later', curious: 'Just curious' },
      projectsBuyer: { buy_3m: 'Buy within 3 months', buy_12m: 'Buy within a year', looking: 'Just looking' },
      alerts: 'I agree to receive by e-mail the new estimate of my property after each official price update. One-click unsubscribe in every e-mail.',
      alertPending: 'To activate the value alert, click the confirmation link in the e-mail you received.',
      consent: 'I agree that Z Find uses this information to send me this report and contact me about my property plans.',
      rgpd: 'Data used only for this report and to follow up on your request; never sold or passed on. To access, correct or delete it:',
      send: 'Send the report', sending: 'Sending…',
      sent: e => `Sent. Check your inbox (${e}).`,
      sendErrors: { email: 'Enter a valid e-mail address.', consent: 'Tick the consent box to receive the report.', phone: 'Invalid phone number.', generic: 'Sending failed. Please try again shortly.' }
    })
  });

  function copyFor(lang) { return COPY[lang] || COPY.en; }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fold(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function money(v, lang) {
    const n = new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-IE', { maximumFractionDigits: 0 }).format(v);
    return lang === 'fr' ? `${n} €` : `€${n}`;
  }
  function pct(v, lang) {
    return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-IE', { style: 'percent', maximumFractionDigits: 0, signDisplay: 'always' }).format(v);
  }

  const cache = new Map();
  function load(path) {
    if (!cache.has(path)) {
      cache.set(path, fetch('/' + path, { credentials: 'omit' }).then(r => {
        if (!r.ok) throw new Error(path + ' ' + r.status);
        return r.json();
      }).catch(e => { cache.delete(path); throw e; }));
    }
    return cache.get(path);
  }

  /* Commune search: rows [code, name, "postcodes", "alias|alias", parent] */
  function searchPlaces(rows, query, limit) {
    const q = fold(query.trim());
    if (q.length < 2) return [];
    const digits = /^\d+$/.test(q);
    const scored = [];
    for (const r of rows) {
      let score = -1;
      let via = '';
      if (digits) {
        if (r[2] && r[2].split(' ').some(cp => cp.startsWith(q))) score = 3;
      } else {
        const n = fold(r[1]);
        if (n === q) score = 5;
        else if (n.startsWith(q)) score = 4;
        else if (n.includes(q)) score = 2;
        else if (r[3]) {
          const alias = r[3].split('|').find(a => fold(a).includes(q));
          if (alias) { score = fold(alias).startsWith(q) ? 2.5 : 1; via = alias; }
        }
      }
      if (score >= 0) scored.push({ row: r, score, via });
    }
    scored.sort((a, b) => b.score - a.score || a.row[1].length - b.row[1].length || a.row[1].localeCompare(b.row[1], 'fr'));
    return scored.slice(0, limit || 8);
  }

  function placeLabel(market, item) {
    const r = item.row;
    const cp = r[2] ? ' · ' + r[2].split(' ').slice(0, 2).join(', ') : '';
    const parent = market === 'FR' ? ` (${r[4]})` : r[4] ? ` — ${r[4]}` : '';
    return `${item.via ? item.via + ' → ' : ''}${r[1]}${cp}${parent}`;
  }

  function readQuery(query) {
    const market = engine.MARKETS.includes(query.market) ? query.market : 'FR';
    const mode = query.mode === 'buyer' ? 'buyer' : 'owner';
    return { market, mode };
  }

  function formHTML(c, market, mode) {
    const types = engine.TYPES[market];
    const energy = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    return `
      <form class="est-form" data-est-form novalidate>
        <div class="est-field est-commune">
          <label for="est-commune">${c.commune}</label>
          <input id="est-commune" type="text" autocomplete="off" placeholder="${esc(c.communePh)}" data-est-commune
                 role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="est-suggest">
          <ul id="est-suggest" class="est-suggest" role="listbox" hidden data-est-suggest></ul>
        </div>
        <div class="est-row">
          <div class="est-field"><label for="est-type">${c.type}</label>
            <select id="est-type" data-est-type>${types.map(t => `<option value="${t}">${esc(c.types[t])}</option>`).join('')}</select></div>
          <div class="est-field"><label for="est-surface">${c.surface}</label>
            <input id="est-surface" type="number" inputmode="numeric" min="9" max="2000" step="1" data-est-surface></div>
        </div>
        <div class="est-row">
          <div class="est-field"><label for="est-condition">${c.condition}</label>
            <select id="est-condition" data-est-condition>${Object.entries(c.conditions).map(([k, v]) => `<option value="${k}"${k === 'standard' ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
          <div class="est-field"><label for="est-energy">${c.energy[market]}</label>
            <select id="est-energy" data-est-energy><option value="">${c.energyUnknown}</option>${energy.map(e => `<option value="${e}">${e}</option>`).join('')}</select></div>
        </div>
        <div class="est-row" data-est-apartment-only>
          <div class="est-field"><label for="est-floor">${c.floor}</label>
            <select id="est-floor" data-est-floor><option value="">—</option><option value="0">${c.floorGround}</option>${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}">${n}${n === 6 ? '+' : ''}</option>`).join('')}</select></div>
          <label class="est-check est-lift"><input type="checkbox" data-est-lift checked> ${c.lift}</label>
        </div>
        ${market === 'LU' ? `<label class="est-check" data-est-apartment-only><input type="checkbox" data-est-newbuild> ${c.newBuild}</label>` : ''}
        <fieldset class="est-features"><legend>${c.features}</legend>
          ${Object.entries(c.f).map(([k, v]) => `<label class="est-check" data-est-feature="${k}"><input type="checkbox" value="${k}"> ${esc(v)}</label>`).join('')}
        </fieldset>
        ${mode === 'buyer' ? `<div class="est-field"><label for="est-asking">${c.asking}</label><input id="est-asking" type="number" inputmode="numeric" min="10000" step="1000" data-est-asking></div>` : ''}
        <p class="est-error" data-est-error role="alert" hidden></p>
        <button type="submit" class="est-submit">${mode === 'buyer' ? c.submitBuyer : c.submit}</button>
      </form>`;
  }

  function resultHTML(c, lang, r, input) {
    const typeLabel = c.typesSales[input.type];
    const adjustments = r.adjustments.length
      ? `<ul class="est-adj">${r.adjustments.map(a => `<li><span>${esc(c.adj[a.key] || a.key)}</span><strong>${pct(a.pct, lang)}</strong></li>`).join('')}</ul>`
      : `<p class="est-muted">${c.adjNone}</p>`;
    const notes = [];
    if (r.model.referenceSurface) notes.push(c.beNote(r.model.referenceSurface));
    if (r.model.askToSold) notes.push(c.luHouseNote(r.model.askToSold));
    let buyer = '';
    if (r.buyer) {
      const d = pct(Math.abs(r.buyer.deltaPct), lang).replace(/^[+-]/, '');
      const msg = r.buyer.position === 'within' ? c.buyer.within
        : r.buyer.position === 'below' ? c.buyer.below(pct(Math.abs((r.buyer.askingPrice - r.low) / r.low), lang).replace(/^[+-]/, ''))
        : c.buyer.above(d);
      const span = r.high - r.low || 1;
      const at = Math.max(0, Math.min(100, ((r.buyer.askingPrice - r.low) / span) * 100));
      buyer = `<div class="est-buyer est-buyer-${r.buyer.position}">
        <div class="est-bar"><span class="est-bar-range"></span><span class="est-bar-mark" style="left:${at.toFixed(1)}%"></span></div>
        <p><strong>${money(r.buyer.askingPrice, lang)}</strong> — ${msg}</p></div>`;
    }
    return `
      <section class="est-result" data-est-result aria-live="polite">
        <span class="eyebrow">${c.resultTitle}</span>
        <p class="est-range"><strong>${money(r.low, lang)}</strong> <span>–</span> <strong>${money(r.high, lang)}</strong></p>
        <p class="est-central">${c.centralLabel}${c.colon}<strong>${money(r.central, lang)}</strong> · ${money(r.perM2, lang)}${c.perM2}
          <span class="est-badge est-badge-${r.confidence}">${c.confidence[r.confidence]}</span></p>
        ${buyer}
        <p class="est-basis">${esc(c.basis(r.basis, typeLabel))}</p>
        <h3 class="est-subtitle">${c.adjTitle}</h3>
        ${adjustments}
        ${notes.map(n => `<p class="est-muted">${esc(n)}</p>`).join('')}
        <p class="est-muted">${c.disclaimer} ${c.source}${c.colon}${esc(r.basis.source)}.</p>
      </section>`;
  }

  /* "Affiner": optional extra questions under the first result. Empty
     answers are ignored; the result is recomputed with the same engine. */
  function refineHTML(c, input, open) {
    const r = input.refine || {};
    const apartment = input.type === 'apartment';
    const sel = key => {
      const f = c.refineFields[key];
      return `<div class="est-field"><label for="est-r-${key}">${f.label}</label>
        <select id="est-r-${key}" data-est-r="${key}"><option value="">${c.refineUnknown}</option>${Object.entries(f.options).map(([k, v]) => `<option value="${k}"${r[key] === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></div>`;
    };
    const num = (key, label) => `<div class="est-field"><label for="est-r-${key}">${label}</label>
        <input id="est-r-${key}" type="number" inputmode="numeric" min="0" step="1" data-est-r="${key}" value="${r[key] != null ? esc(r[key]) : ''}"></div>`;
    const chk = (key, label) => `<label class="est-check"><input type="checkbox" data-est-r="${key}"${r[key] ? ' checked' : ''}> ${esc(label)}</label>`;
    return `
      <details class="est-refine" data-est-refine-wrap${open ? ' open' : ''}>
        <summary><span class="est-refine-title">${c.refineTitle}</span><span class="est-refine-lead">${c.refineLead}</span></summary>
        <form class="est-refine-form" data-est-refine novalidate>
          ${sel('location')}
          <div class="est-row">${sel('view')}${sel('standing')}</div>
          <div class="est-row">${sel('era')}${sel('light')}</div>
          <div class="est-row">${sel('parking')}${apartment ? num('outdoorArea', c.refineOutdoorArea) : num('landArea', c.refineLandArea)}</div>
          <div class="est-refine-checks">${apartment ? chk('topFloor', c.refineTopFloor) : ''}${chk('cellar', c.refineCellar)}${chk('nuisance', c.refineNuisance)}</div>
          <button type="submit" class="est-submit">${c.refineSubmit}</button>
          <p class="est-sent" data-est-refine-done role="status" hidden></p>
        </form>
      </details>`;
  }

  function wideScreen() {
    try { return typeof window !== 'undefined' && window.matchMedia('(min-width: 861px)').matches; } catch (_) { return false; }
  }

  function readRefine(formEl) {
    const out = {};
    formEl.querySelectorAll('[data-est-r]').forEach(el => {
      const key = el.getAttribute('data-est-r');
      if (el.type === 'checkbox') { if (el.checked) out[key] = true; }
      else if (el.type === 'number') { if (el.value !== '') out[key] = Number(el.value); }
      else if (el.value) out[key] = el.value;
    });
    return out;
  }

  /* Right-hand column before the first estimate: how it works, the
     official source of the chosen market, and what the visitor gets. */
  function introHTML(c, market, mode) {
    const steps = c.introSteps[mode] || c.introSteps.owner;
    return `
      <aside class="est-intro" data-est-intro>
        <h2 class="est-intro-title">${c.introTitle}</h2>
        <ol class="est-steps">${steps.map(step => `<li>${esc(step)}</li>`).join('')}</ol>
        <div class="est-source"><span class="est-source-label">${c.introSourceLabel}</span><span>${esc(c.introSources[market] || '')}</span></div>
        <ul class="est-points">${c.introPoints.map(point => `<li>${esc(point)}</li>`).join('')}</ul>
        <p class="est-muted">${esc(c.introNote)}</p>
      </aside>`;
  }

  function reportHTML(c, mode) {
    const projects = mode === 'buyer' ? c.projectsBuyer : c.projectsOwner;
    return `
      <form class="est-report" data-est-report novalidate>
        <h2 class="est-report-title">${c.reportTitle}</h2>
        <p class="est-muted">${c.reportLead}</p>
        <div class="est-row">
          <div class="est-field"><label for="est-name">${c.name}</label><input id="est-name" type="text" autocomplete="name" maxlength="120" data-est-name></div>
          <div class="est-field"><label for="est-email">${c.email}</label><input id="est-email" type="email" autocomplete="email" maxlength="200" required data-est-email></div>
        </div>
        <div class="est-row">
          <div class="est-field"><label for="est-phone">${c.phone}</label><input id="est-phone" type="tel" autocomplete="tel" maxlength="40" data-est-phone></div>
          <div class="est-field"><label for="est-project">${c.project}</label>
            <select id="est-project" data-est-project>${Object.entries(projects).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
        </div>
        <label class="est-hp" aria-hidden="true">Website <input type="text" tabindex="-1" autocomplete="off" data-est-hp></label>
        ${mode === 'buyer' ? '' : `<label class="est-check"><input type="checkbox" data-est-alerts> ${c.alerts}</label>`}
        <label class="est-check est-consent"><input type="checkbox" data-est-consent> ${c.consent}</label>
        <p class="est-rgpd">${c.rgpd} <a href="mailto:${DATA_CONTACT}">${DATA_CONTACT}</a></p>
        <p class="est-error" data-est-send-error role="alert" hidden></p>
        <button type="submit" class="est-submit">${c.send}</button>
        <p class="est-sent" data-est-sent role="status" hidden></p>
      </form>`;
  }

  function render(rootEl, lang, query) {
    if (!rootEl || !engine) return false;
    const c = copyFor(lang);
    const state = Object.assign(readQuery(query || {}), { place: null, input: null, result: null });

    function hrefFor(market, mode) { return `#/${lang}/estimation?market=${market}&mode=${mode}`; }

    rootEl.innerHTML = `
      <div class="wrap est-page">
        <header class="est-head">
          <span class="eyebrow">${c.eyebrow}</span>
          <h1>${c.title}</h1>
          <p class="est-lead">${c.lead}</p>
          <div class="est-switches">
            <nav class="est-modes" aria-label="${c.eyebrow}">
              <a href="${hrefFor(state.market, 'owner')}" class="${state.mode === 'owner' ? 'active' : ''}" ${state.mode === 'owner' ? 'aria-current="page"' : ''}>${c.modeOwner}</a>
              <a href="${hrefFor(state.market, 'buyer')}" class="${state.mode === 'buyer' ? 'active' : ''}" ${state.mode === 'buyer' ? 'aria-current="page"' : ''}>${c.modeBuyer}</a>
            </nav>
            <nav class="est-markets" aria-label="${c.commune}">
              ${engine.MARKETS.map(m => `<a href="${hrefFor(m, state.mode)}" class="${m === state.market ? 'active' : ''}" ${m === state.market ? 'aria-current="page"' : ''}>${c.markets[m]}</a>`).join('')}
            </nav>
          </div>
        </header>
        <div class="est-grid">
          <div class="est-col est-col-inputs">${formHTML(c, state.market, state.mode)}<div class="est-refine-slot" data-est-refine-slot></div></div>
          <div class="est-col est-col-output" data-est-output>${introHTML(c, state.market, state.mode)}</div>
        </div>
      </div>`;

    const form = rootEl.querySelector('[data-est-form]');
    const communeInput = form.querySelector('[data-est-commune]');
    const suggest = form.querySelector('[data-est-suggest]');
    const typeSelect = form.querySelector('[data-est-type]');
    const error = form.querySelector('[data-est-error]');
    const output = rootEl.querySelector('[data-est-output]');
    const refineSlot = rootEl.querySelector('[data-est-refine-slot]');
    let rows = null;
    let items = [];
    let active = -1;

    function syncType() {
      const apartment = typeSelect.value === 'apartment';
      form.querySelectorAll('[data-est-apartment-only]').forEach(el => { el.hidden = !apartment; });
      form.querySelectorAll('[data-est-feature]').forEach(el => {
        const k = el.getAttribute('data-est-feature');
        el.hidden = apartment ? k === 'pool' : (k === 'balcony' || k === 'terrace' || k === 'garden');
      });
    }
    typeSelect.addEventListener('change', syncType);
    syncType();

    function closeSuggest() { suggest.hidden = true; communeInput.setAttribute('aria-expanded', 'false'); active = -1; }
    function choose(i) {
      const item = items[i];
      if (!item) return;
      state.place = { code: item.row[0], name: item.row[1] };
      communeInput.value = item.row[1];
      closeSuggest();
    }
    function drawSuggest() {
      suggest.innerHTML = items.map((it, i) => `<li role="option" id="est-opt-${i}" data-i="${i}" aria-selected="${i === active}" class="${i === active ? 'active' : ''}">${esc(placeLabel(state.market, it))}</li>`).join('');
      suggest.hidden = !items.length;
      communeInput.setAttribute('aria-expanded', String(!!items.length));
      if (active >= 0) communeInput.setAttribute('aria-activedescendant', `est-opt-${active}`); else communeInput.removeAttribute('aria-activedescendant');
    }
    communeInput.addEventListener('input', async () => {
      state.place = null;
      if (!rows) {
        try { rows = await load(`geo/search/${state.market.toLowerCase()}.json`); } catch (_) { rows = []; }
      }
      items = searchPlaces(rows, communeInput.value, 8);
      active = -1;
      drawSuggest();
    });
    communeInput.addEventListener('keydown', e => {
      if (suggest.hidden) return;
      if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); drawSuggest(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); drawSuggest(); e.preventDefault(); }
      else if (e.key === 'Enter' && active >= 0) { choose(active); e.preventDefault(); }
      else if (e.key === 'Escape') closeSuggest();
    });
    suggest.addEventListener('mousedown', e => {
      const li = e.target.closest('[data-i]');
      if (li) { choose(Number(li.getAttribute('data-i'))); e.preventDefault(); }
    });
    communeInput.addEventListener('blur', () => setTimeout(closeSuggest, 150));

    function readInput() {
      const features = {};
      form.querySelectorAll('[data-est-feature]:not([hidden]) input:checked').forEach(i => { features[i.value] = true; });
      const floorVal = form.querySelector('[data-est-floor]').value;
      const asking = form.querySelector('[data-est-asking]');
      const newBuild = form.querySelector('[data-est-newbuild]');
      const apartment = typeSelect.value === 'apartment';
      return {
        market: state.market,
        communeCode: state.place ? state.place.code : '',
        type: typeSelect.value,
        surface: Number(form.querySelector('[data-est-surface]').value),
        condition: form.querySelector('[data-est-condition]').value,
        energy: form.querySelector('[data-est-energy]').value || null,
        features,
        floor: apartment && floorVal !== '' ? Number(floorVal) : null,
        lift: apartment ? form.querySelector('[data-est-lift]').checked : null,
        newBuild: !!(apartment && newBuild && newBuild.checked),
        askingPrice: asking && asking.value !== '' ? Number(asking.value) : null
      };
    }

    function showError(el, msg) { el.textContent = msg; el.hidden = !msg; }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const input = readInput();
      if (state.mode === 'buyer' && input.askingPrice == null) { showError(error, c.errors.askingPrice); return; }
      const problems = engine.validate(input);
      if (problems.length) { showError(error, c.errors[problems[0]] || c.errors.generic); return; }
      showError(error, '');
      const btn = form.querySelector('.est-submit');
      btn.disabled = true; btn.textContent = c.computing;
      let result;
      try { result = await engine.estimate(input, load); } catch (_) { result = { ok: false, errors: ['generic'] }; }
      btn.disabled = false; btn.textContent = state.mode === 'buyer' ? c.submitBuyer : c.submit;
      if (!result.ok) { showError(error, c.errors[result.errors[0]] || c.errors.generic); output.innerHTML = introHTML(c, state.market, state.mode); refineSlot.innerHTML = ''; return; }
      state.input = input; state.result = result;
      // Inputs on the left (form, then the optional questions), outputs on the
      // right (result, then the report): two columns of similar height.
      output.innerHTML = `<div class="est-result-wrap" data-est-result-wrap>${resultHTML(c, lang, result, input)}</div>` + reportHTML(c, state.mode);
      refineSlot.innerHTML = refineHTML(c, input, wideScreen());
      wireRefine();
      wireReport();
      output.querySelector('[data-est-result]').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });

    function wireRefine() {
      const refineForm = refineSlot.querySelector('[data-est-refine]');
      if (!refineForm) return;
      const done = refineForm.querySelector('[data-est-refine-done]');
      refineForm.addEventListener('submit', async e => {
        e.preventDefault();
        const input = Object.assign({}, state.input, { refine: readRefine(refineForm) });
        const btn = refineForm.querySelector('.est-submit');
        btn.disabled = true; btn.textContent = c.computing;
        let result;
        try { result = await engine.estimate(input, load); } catch (_) { result = { ok: false }; }
        btn.disabled = false; btn.textContent = c.refineSubmit;
        if (!result || !result.ok) return;
        state.input = input; state.result = result;
        output.querySelector('[data-est-result-wrap]').innerHTML = resultHTML(c, lang, result, input);
        done.textContent = result.refineCount ? c.refineDone(result.refineCount) : '';
        done.hidden = !result.refineCount;
        output.querySelector('[data-est-result]').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }

    function wireReport() {
      const report = output.querySelector('[data-est-report]');
      const err = report.querySelector('[data-est-send-error]');
      const sent = report.querySelector('[data-est-sent]');
      report.addEventListener('submit', async e => {
        e.preventDefault();
        const email = report.querySelector('[data-est-email]').value.trim();
        const phone = report.querySelector('[data-est-phone]').value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showError(err, c.sendErrors.email); return; }
        if (phone && !/^[\d+\s().-]{7,20}$/.test(phone)) { showError(err, c.sendErrors.phone); return; }
        if (!report.querySelector('[data-est-consent]').checked) { showError(err, c.sendErrors.consent); return; }
        showError(err, '');
        const btn = report.querySelector('.est-submit');
        btn.disabled = true; btn.textContent = c.sending;
        try {
          const res = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lang, mode: state.mode, input: state.input, place: state.place,
              contact: {
                name: report.querySelector('[data-est-name]').value.trim(),
                email, phone,
                project: report.querySelector('[data-est-project]').value,
                alerts: Boolean(report.querySelector('[data-est-alerts]') && report.querySelector('[data-est-alerts]').checked),
                consent: true
              },
              website: report.querySelector('[data-est-hp]').value
            })
          });
          if (!res.ok) throw new Error(String(res.status));
          const payload = await res.json().catch(() => ({}));
          report.querySelectorAll('input, select, button').forEach(el => { el.disabled = true; });
          sent.textContent = c.sent(email) + (payload.alert === 'pending' ? ' ' + c.alertPending : ''); sent.hidden = false;
          btn.textContent = c.send;
        } catch (_) {
          btn.disabled = false; btn.textContent = c.send;
          showError(err, c.sendErrors.generic);
        }
      });
    }
    return true;
  }

  return Object.freeze({ COPY, render, _internals: Object.freeze({ searchPlaces, placeLabel, readQuery, fold, introHTML, refineHTML, readRefine }) });
});
