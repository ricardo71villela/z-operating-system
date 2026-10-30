/* ============================================================
   Z FIND — zone prioritaire du référencement : Thonon-les-Bains et
   le bord du Léman (Bas-Chablais, Haute-Savoie)

   Choix du 30/10/2026 : ces communes sont mises en avant dans le
   référencement, même avant d'avoir des annonces :
     * leurs pages « Immobilier à », « Prix immobilier » et « Agences
       immobilières à » sont indexées et dans les sitemaps ;
     * une page de zone : /fr/immobilier/chablais-leman ;
     * les quartiers et hameaux cités sont nommés sur la page de leur
       commune (pas de page propre : sans annonce ni prix à eux, ce
       seraient des pages vides) et reconnus par la recherche du site
       (public/geo/search/fr.json).
   Quartiers et hameaux : uniquement des faits vérifiés (Wikipédia
   « Marin (Haute-Savoie) » ; offices de tourisme pour Corzent ; château
   de Morcy à Thonon).
   ============================================================ */
'use strict';

const HUB_PATH = '/fr/immobilier/chablais-leman';
const HUB_TITLE = 'Thonon-les-Bains et au bord du Léman';

const FOCUS = Object.freeze([
  { c: '74281', n: 'Thonon-les-Bains', places: [
    { n: 'Corzent', kind: 'quartier', about: 'au bord du Léman, avec la plage et le parc de Corzent' },
    { n: 'Morcy', kind: 'quartier', about: 'autour du château de Morcy' }
  ] },
  { c: '74013', n: 'Anthy-sur-Léman', places: [] },
  { c: '74163', n: 'Margencel', places: [] },
  { c: '74166', n: 'Marin', places: [
    { n: 'Marinel', kind: 'hameau' },
    { n: 'Moruel', kind: 'hameau' },
    { n: 'Sussinges', kind: 'hameau' }
  ] },
  { c: '74263', n: 'Sciez', places: [] }
]);

const BY_CODE = new Map(FOCUS.map(f => [f.c, f]));

function isFocus(code) { return BY_CODE.has(String(code || '').toUpperCase()); }
function focusOf(code) { return BY_CODE.get(String(code || '').toUpperCase()) || null; }
function focusCodes() { return FOCUS.map(f => f.c); }

/** « Corzent et Morcy », « Marinel, Moruel et Sussinges ». */
function joinFr(list) {
  const a = list.filter(Boolean);
  if (a.length <= 1) return a.join('');
  return `${a.slice(0, -1).join(', ')} et ${a[a.length - 1]}`;
}

module.exports = { FOCUS, HUB_PATH, HUB_TITLE, isFocus, focusOf, focusCodes, joinFr };
