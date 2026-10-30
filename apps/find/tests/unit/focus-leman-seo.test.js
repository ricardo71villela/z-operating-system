/* Contract: zone prioritaire du référencement — Thonon-les-Bains et le bord
   du Léman (Thonon, Anthy-sur-Léman, Margencel, Marin, Sciez ; quartiers
   Corzent et Morcy ; hameaux Marinel, Moruel, Sussinges). Sans base : pages
   rendues avec les données DVF locales. */
'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('assert');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const FIND = path.join(__dirname, '..', '..');

let passed = 0;
function check(label, value) { assert(value, label); passed += 1; console.log('PASS:', label); }

delete process.env.ZFIND_SUPABASE_SERVICE_KEY;

async function run(mod, query) {
  const h = require(path.join(WEB, 'api', mod));
  const res = { headers: {}, statusCode: 0, body: '', setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b || ''; } };
  await h({ method: 'GET', query, headers: {} }, res);
  return res;
}
const robots = html => (String(html).match(/<meta name="robots" content="([^"]+)"/) || [])[1];

(async () => {
  console.log('\n=== Z FIND — SEO THONON ET LE LÉMAN ===');
  const F = require(path.join(WEB, 'api', '_lib', 'focus-places.js'));
  check('5 communes (codes INSEE vérifiés)', F.focusCodes().join(',') === '74281,74013,74163,74166,74263');
  check('quartiers de Thonon et hameaux de Marin', F.focusOf('74281').places.map(p => p.n).join() === 'Corzent,Morcy' && F.focusOf('74166').places.map(p => p.n).join() === 'Marinel,Moruel,Sussinges');

  const zone = await run('immobilier.js', { p: 'chablais-leman' });
  check('page de zone /fr/immobilier/chablais-leman : 200, indexée', zone.statusCode === 200 && robots(zone.body) === 'index,follow');
  check('page de zone : titre, les 5 communes et les 5 lieux', /<title>Immobilier à Thonon-les-Bains et au bord du Léman/.test(zone.body)
    && ['Thonon-les-Bains', 'Anthy-sur-Léman', 'Margencel', 'Marin', 'Sciez', 'Corzent', 'Morcy', 'Marinel', 'Moruel', 'Sussinges'].every(n => zone.body.includes(n)));
  check('page de zone : liens vers chaque commune (annonces et prix)', ['thonon-les-bains-74281', 'anthy-sur-leman-74013', 'margencel-74163', 'marin-74166', 'sciez-74263'].every(s => zone.body.includes(`/fr/immobilier/${s}`) && zone.body.includes(`/fr/prix-immobilier/france/${s}`)));
  check('page de zone : FAQ structurée (schema.org)', /"@type":"FAQPage"/.test(zone.body) && /hameaux de la commune de Marin/.test(zone.body));

  for (const [slug, places] of [['thonon-les-bains-74281', ['Corzent', 'Morcy']], ['anthy-sur-leman-74013', []], ['margencel-74163', []], ['marin-74166', ['Marinel', 'Moruel', 'Sussinges']], ['sciez-74263', []]]) {
    const r = await run('immobilier.js', { p: slug });
    assert(r.statusCode === 200 && robots(r.body) === 'index,follow', `immobilier ${slug} indexée`);
    assert(places.every(n => r.body.includes(`id="${n.toLowerCase()}"`)), `${slug} : ancres des lieux`);
    assert(r.body.includes('/fr/immobilier/chablais-leman'), `${slug} : lien vers la zone`);
  }
  check('« Immobilier à » des 5 communes : indexées sans annonce, lieux nommés (ancres), lien vers la zone', true);
  const marin = await run('immobilier.js', { p: 'marin-74166' });
  check('description de Marin avec ses hameaux', /<meta name="description" content="Immobilier à Marin \(Marinel, Moruel et Sussinges\)/.test(marin.body));
  const evian = await run('immobilier.js', { p: 'evian-les-bains-74119' });
  check('hors zone, sans annonce : règle inchangée (noindex)', robots(evian.body) === 'noindex,follow');

  const sm = await run('immobilier.js', { sitemap: '1' });
  check('sitemap-immobilier : zone + 5 communes', ['chablais-leman', 'thonon-les-bains-74281', 'anthy-sur-leman-74013', 'margencel-74163', 'marin-74166', 'sciez-74263'].every(s => sm.body.includes(`/fr/immobilier/${s}<`)));

  const prix = await run('prix-immobilier.js', { p: 'france/marin-74166' });
  check('« Prix immobilier » Marin : indexée, hameaux, liens vers les voisines et la zone', robots(prix.body) === 'index,follow' && /Sussinges/.test(prix.body) && /prix-immobilier\/france\/sciez-74263/.test(prix.body) && /chablais-leman/.test(prix.body));
  const P = require(path.join(WEB, 'api', '_lib', 'prix-pages.js'));
  const idx = JSON.parse(fs.readFileSync(path.join(WEB, 'public', 'market-data', 'fr', 'index.json'), 'utf8'));
  const dep74 = JSON.parse(fs.readFileSync(path.join(WEB, 'public', 'market-data', 'fr', 'dep', '74.json'), 'utf8'));
  const paths = P.sitemapPaths({ departments: { 74: idx.departments['74'] }, notUnderDvf: [] }, { 74: dep74 });
  check('sitemap des prix : les 5 communes', ['thonon-les-bains-74281', 'anthy-sur-leman-74013', 'margencel-74163', 'marin-74166', 'sciez-74263'].every(s => paths.includes(`/fr/prix-immobilier/france/${s}`)));

  const ag = await run('agences.js', { p: 'margencel-74163' });
  check('« Agences immobilières » Margencel : indexée, liens zone', robots(ag.body) === 'index,follow' && /chablais-leman/.test(ag.body));
  const agsm = await run('agences.js', { sitemap: '1' });
  check('sitemap des agences : les 5 communes', ['thonon-les-bains-74281', 'anthy-sur-leman-74013', 'margencel-74163', 'marin-74166', 'sciez-74263'].every(s => agsm.body.includes(`/fr/agences-immobilieres/${s}<`)));

  // recherche du site
  const ps = require(path.join(WEB, 'src', 'services', 'place-search.js'));
  ps.setLoader(p => JSON.parse(fs.readFileSync(path.join(WEB, 'public', p), 'utf8')));
  const hit = async q => { const r = await ps.search(q, { countries: ['FR'], limit: 1 }); return r[0] && r[0].code; };
  check('recherche : Corzent et Morcy → Thonon-les-Bains', (await hit('Corzent')) === '74281' && (await hit('morcy')) === '74281');
  check('recherche : Marinel, Moruel, Sussinges → Marin', (await hit('Marinel')) === '74166' && (await hit('moruel')) === '74166' && (await hit('Sussinges')) === '74166');
  const localities = JSON.parse(fs.readFileSync(path.join(FIND, 'scripts', 'geography', 'fr_localities.json'), 'utf8'));
  const build = fs.readFileSync(path.join(FIND, 'scripts', 'geography', 'build_public_divisions.py'), 'utf8');
  check('lieux conservés à la régénération de l’index (fr_localities.json)', localities['74281'] && localities['74166'] && /fr_localities\.json/.test(build));

  // pied de page du site
  const body = fs.readFileSync(path.join(WEB, 'src', 'body.html'), 'utf8');
  check('pied de page : bloc « Thonon et le Léman » sur toutes les pages', /data-i18n="footer\.leman"/.test(body) && ['chablais-leman', 'thonon-les-bains-74281', 'marin-74166', 'sciez-74263'].every(s => body.includes(`/fr/immobilier/${s}"`)));
  const i18n = fs.readFileSync(path.join(WEB, 'src', 'i18n.js'), 'utf8') + fs.readFileSync(path.join(WEB, 'src', 'i18n-phase4.js'), 'utf8');
  check('pied de page traduit dans les 6 langues', (i18n.match(/leman:'/g) || []).length === 6);

  console.log(`\n${passed} checks passed.`);
})().catch(err => { console.error('FAIL:', err.message); process.exit(1); });
