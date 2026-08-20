# Z Fashion — Brand Voice & Copy

## Purpose
Registers the launch slogan and the per-frame copy direction, so tone stays
consistent across Homepage, Corner, All Sale and Product Page as real
content gets written — and so each frame's copy reinforces the same
decisions already made in FRAMES-AND-RECOMMENDATIONS.md and
Z-FASHION-COMPETITIVE-LANDSCAPE.md, rather than drifting independently of
the architecture.

## Slogan (chosen)
**FR (launch market):** *"De A à Z Fashion : le meilleur du commerce
indépendant."*
**PT (gloss):** *"De A a Z Fashion: o melhor do comércio independente."*

Rationale: does double duty — reinforces the brand name itself (the A→Z
wordplay lands on "Z Fashion") while stating the actual differentiation
already established against Decathlon-scale players: curation of
independent commerce, not price competition at scale.

## Per-frame tone

- **Homepage hero** (no active Campaign): *"Des centaines de boutiques. Un
  seul panier."* / *Centenas de boutiques. Um único carrinho.* — leads
  with the unified-cart value proposition when there's no time-boxed
  Campaign to lead with instead (see FRAMES-AND-RECOMMENDATIONS.md Hero
  selection rule).
- **Corner (per Partner)** — never platform voice. Each Corner carries a
  short byline in the Partner's own voice (e.g. *"Atelier fondé en 2015 à
  Paris"*), because Corner identity preservation is the Central Thesis
  commitment this whole platform is built around — the copy has to make
  that felt, not just the layout.
- **All Sale** — *"Toutes les boutiques. Toutes les bonnes affaires."* /
  *Todas as boutiques. Todas as boas ofertas.* — breadth and discovery,
  the deliberate tonal opposite of the Corner's intimate, single-Partner
  voice.
- **Product Page**, near the purchase CTA — a discreet trust line: *"Vendu
  et expédié par [Partner name]."* This is not just brand reinforcement —
  it fulfills the professional-seller disclosure duty already flagged as
  a Phase 2 legal requirement in DOMAIN-SKETCH.md (EU Omnibus Directive),
  so the copy and the compliance obligation are satisfied by the same line.
- **Sponsored Destaques slot** — copy always carries the "Patrocinado" /
  "Sponsorisé" label as established in FRAMES-AND-RECOMMENDATIONS.md;
  never phrased to read as editorial curation.

## Status
Draft

## Last Updated
2026-08-20

## Partner sign-in layout (mirrors Z Find Partner)
Same structure as the existing Z Find Partner sign-in: dark editorial left
panel (headline + three-value-prop row) / light sign-in form right panel.
Z Fashion swaps Z Find's gold-line globe illustration for gold-line fashion
croquis (garment sketches) — same brand treatment (thin gold line art,
low-opacity, background texture never protagonist), different motif,
consistent with the cross-vertical ZOS visual language rather than
reinventing it per app.

Three value props (mirrors Z Find Partner's Listings/Leads/Standing row):
- **Stock** — Uniquement le vôtre / Yours alone
- **Prix** — Jamais partagés / Never shared
- **Réputation** — Gagnée, pas achetée / Earned, not bought — direct
  callback to the Partner Quality Score gate on Sponsored Destaques
  (FRAMES-AND-RECOMMENDATIONS.md), so the sign-in page's promise and the
  platform's actual paid-placement policy say the same thing.

## Decoration illustration: sourcing decision
The gold-line croquis/illustration motif for the Partner sign-in (and any
other frame using this decorative language) is **not buildable to the
required quality as hand-authored SVG** — attempted repeatedly in-session
and rejected each time; the reference quality (tonal pencil rendering,
dynamic couture pose) requires an actual illustrator's or licensed line-art
asset, not vector paths coded by hand. Decision: commission or license a
real fashion-illustration asset for production; the sign-in layout, palette,
typography and copy validated in this session stand as-is and are not
blocked by the illustration gap.

## Logo mark
The shared ZOS Group logo — a gold map-pin silhouette with a "Z" inside,
metallic gold on black — is the literal brand mark, provided as a real
asset, not something to redraw. Z Fashion reuses it exactly as Z Find does:
the icon paired with the vertical's own wordmark ("Z Fashion" beside the
pin), not a Fashion-specific icon variant. Production embeds the actual
provided image file for the icon; per the illustration-sourcing decision
above, no attempt is made to reproduce its metallic gradient in hand-coded
SVG — flat-design mockup tools stand in with a plain icon placeholder only,
never a redrawn approximation of the real mark.

## Logo asset note
The provided logo file has a solid black background baked in, not
transparency — placed on any panel colour other than pure black (e.g. the
sign-in left panel's `#1c1a16`), this creates a visible seam between two
different blacks. Fixed by extracting a transparency mask from the source
file (luminance-based: dark background → transparent, gold linework →
opaque) rather than redrawing the mark. The corrected transparent PNG is
the one to use in any future placement — never the original solid-black
file — regardless of what background colour it sits on.
