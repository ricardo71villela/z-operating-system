/* ============================================================
   Z FIND — zone-images.js
   ============================================================
   Explicit mapping from a zone's real name (as stored in
   zones_lite.name) to a decorative photo. Deliberately a flat, named
   lookup table — never fuzzy/slug-matched — so a zone can never
   silently pick up the wrong photo because two names happened to
   normalise the same way.

   PROVENANCE: 16 real photographs, sourced from the Z Imobiliária
   codebase (ricardo71villela/z-imoveis, assets/zonas/), reviewed
   individually before use — confirmed to be generic neighbourhood/
   street photography, no visible branding, logo, or text overlay, and
   not tied to any specific property listing. Explicitly excluded from
   this review: team photos, "about us" imagery, social-share (OG)
   cards (which do carry branding by design), and hero/lifestyle shots
   whose property-specific rights could not be confirmed. Only the
   zone photography passed this review — see docs/architecture/
   Z-IMOVEIS-FINDINGS.md for the fuller reasoning.

   Files live in apps/zfind-web/public/zones/ and are served as static
   assets — never routed through the Supabase signed-URL mechanism
   used for actual listing photos, since these are not stored in
   Supabase at all.

   Only 4 of these 16 map to a real zones_lite row today (Boavista,
   Foz do Douro, Cedofeita, Matosinhos Sul — the only zones seeded by
   Migration 0003). The other 12 are kept ready, at zero extra cost,
   for whenever their zone is genuinely added — not speculative
   infrastructure, just an asset already in hand.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.zoneImages = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {

// Key: exact zones_lite.name value. Value: filename under public/zones/.
const ZONE_IMAGE_MAP = {
  'Boavista': 'boavista.jpg',
  'Foz do Douro': 'foz.jpg',
  'Cedofeita': 'cedofeita.jpg',
  'Matosinhos Sul': 'matosinhos-sul.jpg',
  // Not yet real zones_lite rows — image already available if/when added:
  'Afurada': 'afurada.jpg',
  'Aldoar': 'aldoar.jpg',
  'Antas': 'antas.jpg',
  'Baixa': 'baixa.jpg',
  'Bonfim': 'bonfim.jpg',
  'Cais de Gaia': 'cais-de-gaia.jpg',
  'Gaia Centro': 'gaia-centro.jpg',
  'Leça da Palmeira': 'leca-da-palmeira.jpg',
  'Lordelo do Ouro': 'lordelo-do-ouro.jpg',
  'Ribeira': 'ribeira.jpg',
  'Santa Marinha': 'santa-marinha.jpg',
  'Senhora da Hora': 'senhora-da-hora.jpg',
};

/** Returns the site-relative path for a zone's decorative photo, or
    null when no photo exists for that exact zone name — callers must
    handle null gracefully (no image), never substitute a different
    zone's photo as a fallback. */
function getZoneImagePath(zoneName) {
  const filename = ZONE_IMAGE_MAP[zoneName];
  return filename ? `/zones/${filename}` : null;
}

return { getZoneImagePath, ZONE_IMAGE_MAP };

});
