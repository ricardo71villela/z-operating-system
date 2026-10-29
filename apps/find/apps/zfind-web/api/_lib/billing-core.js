/* ============================================================
   Z FIND — règles de facturation (sans réseau)

   - Paliers et prix : src/services/pro-offer.js (PRICES), seule source.
   - Fin des mois offerts : 3 mois après le lancement public
     (LAUNCH_DATE) ou après l'inscription de l'agence si elle est
     postérieure.
   - TVA (ZFIND_VAT_MODE) :
       standard  (défaut) : France 20 % ; Belgique / Luxembourg avec
                  numéro de TVA intracommunautaire : autoliquidation
                  (0 %, mention sur la facture) ; sans numéro : 20 %.
       franchise : franchise en base, aucune TVA, mention
                  « TVA non applicable, art. 293 B du CGI ».
   - Les prix Stripe sont retrouvés par leur lookup_key (créés au premier
     besoin) : aucune référence de prix à recopier dans Vercel.
   ============================================================ */
'use strict';

const proOffer = require('../../src/services/pro-offer.js');

const PRICES = proOffer.PRICES;
const LAUNCH_DATE = proOffer.LAUNCH_DATE;
const TIERS = Object.freeze(['essentiel', 'plus', 'pro', 'premium']);
const TIER_NAMES = Object.freeze({ essentiel: 'Essentiel', plus: 'Plus', pro: 'Pro', premium: 'Premium' });
const PRODUCT_ID = 'zfind_subscription';
const PRICE_VERSION = 'v1';

function lookupKey(tier) { return `zfind_sub_${tier}_${PRICE_VERSION}`; }
function tierFromLookupKey(key) { const m = String(key || '').match(/^zfind_sub_(essentiel|plus|pro|premium)_v\d+$/); return m ? m[1] : null; }
function tierFor(listings) { return proOffer.tierFor(listings); }
function priceCents(tier) { const p = PRICES[tier]; return p == null ? null : Math.round(p * 100); }

function addMonths(date, months) {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** Fin des mois offerts : max(lancement, inscription) + 3 mois, à minuit UTC. */
function freeMonthsEnd(signupAt, now) {
  const launch = new Date(`${LAUNCH_DATE}T00:00:00Z`);
  const signup = signupAt ? new Date(signupAt) : null;
  const start = signup && !Number.isNaN(signup.getTime()) && signup > launch ? signup : launch;
  const end = addMonths(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())), PRICES.freeMonths);
  const current = now ? new Date(now) : new Date();
  return end > current ? end : null; // null : plus de mois offerts
}

function vatMode(env) { return String((env || process.env).ZFIND_VAT_MODE || 'standard').trim() === 'franchise' ? 'franchise' : 'standard'; }

const VAT_RE = { FR: /^FR[0-9A-Z]{2}\d{9}$/, BE: /^BE[01]\d{9}$/, LU: /^LU\d{8}$/ };
/** « be 0123.456.789 » → « BE0123456789 », ou null si le format ne correspond pas au pays. */
function normalizeVat(value, country) {
  const v = String(value || '').toUpperCase().replace(/[\s.\-]/g, '');
  if (!v) return null;
  const re = VAT_RE[country];
  return re && re.test(v) ? v : null;
}

const FOOTERS = Object.freeze({
  reverse_charge: 'Autoliquidation : TVA due par le preneur (article 196 de la directive 2006/112/CE). Prestation de services électroniques B2B.',
  franchise: 'TVA non applicable, art. 293 B du CGI.'
});

/** Régime de TVA d'une agence : 'fr_standard' (20 %), 'reverse_charge' ou 'franchise'. */
function vatRegime(country, vatNumber, env) {
  if (vatMode(env) === 'franchise') return 'franchise';
  if ((country === 'BE' || country === 'LU') && normalizeVat(vatNumber, country)) return 'reverse_charge';
  return 'fr_standard';
}

module.exports = { PRICES, LAUNCH_DATE, TIERS, TIER_NAMES, PRODUCT_ID, PRICE_VERSION, FOOTERS, lookupKey, tierFromLookupKey, tierFor, priceCents, addMonths, freeMonthsEnd, vatMode, normalizeVat, vatRegime };
