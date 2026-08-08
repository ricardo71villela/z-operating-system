# Design System

## Purpose
Defines the shared visual language of the Z ecosystem — the color, typography, spacing, motion and component rules that keep Z Imobiliária and the Z Operating System recognizably part of the same family, without being visually identical. This is the operational reference for interface, product and visual experience decisions across the ecosystem.

## Scope
Design decisions and rules of use: what tokens exist, what they mean, and when to use them. Does not contain implementation code, a component library, or complete CSS — see §7 (Components) and §12 (Relationship with 130-design) below. Does not define design philosophy or design-thinking principles in the abstract — see `130-design/README.md`.

## Table of Contents
1. [Visual Philosophy](#1-visual-philosophy)
2. [Token Architecture: Three Layers](#2-token-architecture-three-layers)
3. [Color System](#3-color-system)
4. [Typography](#4-typography)
5. [Spacing & Geometry](#5-spacing--geometry)
6. [Motion](#6-motion)
7. [Components](#7-components)
8. [Interface Principles](#8-interface-principles)
9. [Design for Trust](#9-design-for-trust)
10. [Relationship with Z Operating System Principles](#10-relationship-with-z-operating-system-principles)
11. [Relationship with Z Imobiliária](#11-relationship-with-z-imobiliária)
12. [Relationship with 130-design](#12-relationship-with-130-design)

---

## 1. Visual Philosophy

The Z ecosystem's visual language should read as **editorial + architecture + data + trust**. It should never read as a generic SaaS startup, an aggressive financial dashboard, a noisy real-estate app, or a technology product relying on gradients and excess effects.

The governing principle, extracted directly from the existing Z Imobiliária codebase and elevated here as a Z Operating System principle: **premium restraint.** Quality comes from proportion, typography, hierarchy, space, consistency and precision — never from decoration.

The system should communicate: containment, confidence, precision, sophistication, clarity, intelligence, quality, permanence.

## 2. Token Architecture: Three Layers

Every token and rule in this document belongs to one of three layers. Confusing these layers is what would turn a specific brand's visual choices into an unjustified universal constitution — so every subsequent section states which layer it belongs to.

```
Z Design Foundations
        ↓
Z Imobiliária Brand Expression
        ↓
Product-specific Expression
```

**A. Z Design Foundations** — relatively stable, transversally reusable *principles*, independent of any specific typeface, color, or exact value:

- visual restraint;
- clarity;
- hierarchy;
- an editorial/structured relationship between display and interface typography (a differentiated display face for character, paired with a highly legible interface face for operational interaction);
- contained geometry;
- deliberate motion;
- accessibility;
- evidence visibility;
- the distinction between fact, estimate, signal and interpretation;
- avoidance of false precision.

These are the only elements of this document that every future Z product is expected to honor.

**B. Z Imobiliária Brand Expression** — the *first concrete implementation* of the Foundations above, extracted as fact from the existing Z Imobiliária codebase: the exact gold palette, Cormorant Garamond, DM Sans, the specific gray scale, specific editorial patterns, and gold as the primary brand accent. **Z Imobiliária is the first expression of this system — it is not the immutable visual constitution of every future product.** Sections 3–7 document this layer, and each states clearly which parts are Foundation-level principle versus Z Imobiliária-specific implementation.

**C. Product-specific Expression** — a future product may use a different display typeface, a different accent color, different density, different interaction patterns, or different visual emphasis than Z Imobiliária, provided it still honors the Foundations in Layer A and the relevant trust, clarity, evidence and accessibility rules in this document. No specific future product is defined here — this layer is a placeholder for expression that doesn't exist yet.

## 3. Color System

**Layer B — Z Imobiliária Brand Expression. Fact, extracted from Z Imobiliária (`index.html`, root CSS custom properties):**

```css
--white:  #FFFFFF     --black:  #0A0A0A
--gray-50:  #F8F8F6   --gray-100: #F0EFE9   --gray-200: #E2E0D8
--gray-300: #C8C6BC   --gray-400: #9E9C94   --gray-500: #6E6C64
--gray-700: #3A3834   --gray-900: #1A1916

--gold:       #B8935A
--gold-light: #D4AF7A
--gold-dark:  #8B6B3A
--gold-pale:  #F5EDD8
```

**Utility color (functional only):**
```css
WhatsApp green: #25D366
```

**Rules of use:**

- **Gold is the primary brand accent of the Z Imobiliária expression.** It marks primary calls to action, interactive emphasis, and moments of distinction within Z Imobiliária. It is not decorative. A future product (Layer C) may choose a different accent color while still honoring the Foundation-level principle that *some* single, restrained accent exists and is used deliberately, not decoratively.
- **Semantic colors are not decorative accents, and take precedence over brand color consistency.** Where an interface needs to communicate success, warning, error, information, risk, or status, it uses a color chosen for that semantic meaning — never gold, and never a color repurposed from the brand palette for a meaning it wasn't chosen for. This document does not define a full semantic palette; it establishes the principle that semantic meaning is never sacrificed to keep a screen "on-brand."
- **WhatsApp green is strictly functional.** It appears only on WhatsApp-specific actions. It is never used as a second brand accent, a decorative color, or a general-purpose status color — using it for anything but WhatsApp actions would blur both the brand-accent rule and the semantic-color rule above.
- **Grayscale carries the editorial weight.** Ninety percent of any interface should be built from the gray/black/white scale; the accent is reserved for the small fraction of elements that genuinely need emphasis.

**Dark mode (fact, extracted):** Z Imobiliária implements dark mode as a **transformation of the neutral scale**, not a second independent identity:

```css
[data-theme="dark"] {
  --white: #0A0A0A;   --black: #F5F4F0;
  --gray-50: #111110;  --gray-100: #1A1916; --gray-200: #242320;
  --gray-300: #3A3834; --gray-400: #6E6C64; --gray-500: #9E9C94;
  --gray-700: #C8C6BC; --gray-900: #E8E6DC;
  --gold-pale: #1E1A10;
}
```

**Layer A — Foundation principle:** dark mode is a transformation of the neutral scale, never a separately designed identity. This principle applies regardless of which accent color a Layer C product chooses — only the mechanism (invert the neutrals, hold the accent's role constant) is a Foundation-level rule.

## 4. Typography

**Layer A — Foundation principle:** a product may use a differentiated display typeface for editorial or high-level communication, paired with a highly legible interface typeface for operational interaction. This pairing logic — not any specific typeface — is what's transversal.

**Layer B — Z Imobiliária expression. Fact, extracted from Z Imobiliária:**

```
Display / Headings: 'Cormorant Garamond', serif   (weights 300–600, incl. italic)
UI / Body:          'DM Sans', sans-serif          (weights 300–500)
```

The combination represents **editorial character + operational clarity** — a serif for moments that need distinction (headlines, positioning statements), a humanist sans for everything that needs to be read quickly and precisely (navigation, data, forms, body copy).

**Hierarchy and use (Layer B):**

- Cormorant Garamond is reserved for large titles, hero headlines, editorial titles, and positioning statements — moments of character, not routine UI text.
- DM Sans carries body text, navigation, labels, data, buttons, and forms — anything operational.
- Italic (available in Cormorant Garamond) is used sparingly, for emphasis within an editorial headline — not as a default style.

**Letter-spacing (Layer B, fact, extracted — dominant values `0.1em`–`0.3em`):** wide tracking on uppercase text is a deliberate recurring device for labels, navigation, badges, buttons and small orientation elements.

**Layer A — Foundation principle:** wide tracking, whatever typeface a product uses, is never applied to running body text or paragraph copy — only to short, uppercase, functional strings. Applying it indiscriminately would turn a deliberate signature into visual noise.

## 5. Spacing & Geometry

**Layer B — fact, extracted from Z Imobiliária CSS:**

- `border-radius: 2px` is the dominant, near-universal radius across buttons, inputs, and containers.
- `50%` is used exclusively where something is semantically circular (avatars, icon dots) — never as a generic "rounded card" treatment.
- Common tight-spacing values (gaps between related elements): `8px`, `10px`, `12px`, `14px`.
- Common section-level spacing (breathing room between major sections): `60px`, `90px`.

**Layer A — Foundation principle:** contained, restrained geometry — small or no radius, deliberate spacing rhythm. The exact values above are Z Imobiliária's implementation of that principle; a Layer C product may use a different concrete scale while still keeping geometry contained rather than decorative. Do not introduce a new spacing system for Z Imobiliária interfaces specifically — extend the existing scale only when a genuinely new context requires it.

**Geometry rule (Layer B, specific):** no excessively rounded corners anywhere in the Z Imobiliária expression. `2px` communicates precision and containment; large radii read as generic SaaS, which this system explicitly avoids (see §1).

## 6. Motion

**Fact, extracted from Z Imobiliária CSS (Layer B):**

```css
transition: all 0.3s;   /* dominant duration */
--transition: cubic-bezier(0.25, 0.46, 0.45, 0.94);   /* standard easing */
```

Transitions cluster around `0.3s`–`0.4s`, using this single custom easing curve consistently rather than default linear or ease timing.

**Layer A — Foundation principle:** motion reinforces clarity, continuity and hierarchy — it never competes with content. No bouncy, elastic, or attention-seeking animation anywhere in the ecosystem. If a transition would need to be longer than ~0.4s to feel legible, the interaction itself is probably too complex, not the motion too short. The exact duration and easing curve above are Z Imobiliária's implementation; a Layer C product may tune the specific values while keeping motion restrained and purposeful.

## 7. Components

These are conceptual rules of use, not implementation. No complete CSS or component code is defined here — see Scope, above.

### Buttons

**Primary** (fact-derived from `.btn-primary`): gold accent fill, `2px` radius, generous padding, uppercase with deliberate tracking when the label is short. Reserved for the one primary action in a given context.

**Outline**: used when the context demands containment — most notably over photography or high-contrast backgrounds, where a filled button would compete with the image. Same geometry as Primary, different fill logic.

**Z Operating System principle:** every screen has exactly one Primary action. Additional actions use Outline or plain text links — never a second competing filled button.

### Cards

Cards should privilege hierarchy: image/content first, essential information next, metadata, then a clear call to action. Cards must not become generic, excessively rounded content containers — they follow the same `2px` geometry as everything else, and their value comes from information hierarchy, not decorative framing.

### Badges / Labels

Uppercase, tracked, small type scale, controlled contrast — consistent with the typography rule in §4. Used for status, category, or orientation markers, never for long strings of text.

### Data Interfaces

**Z Operating System principle (this is new territory Z Imobiliária's marketing-facing pages don't need, but the Z Operating System does):** data must be legible, hierarchical, contextualized, and — when relevant — accompanied by its provenance. This system explicitly rejects "dashboard theatre": impressive-looking visualizations that don't help anyone make a decision. Every number displayed should make it obvious what it is, where it came from, and how current it is.

## 8. Interface Principles

1. **Clarity before decoration.** If a visual choice doesn't make something easier to understand, it doesn't belong.
2. **Evidence before assertion.** Claims and numbers are shown with their support, not presented as bare conclusions.
3. **Hierarchy before density.** Fitting more on screen is never a goal in itself — legible priority is.
4. **Restraint before novelty.** A new visual pattern is justified only when the existing system genuinely can't express the need — not because something new looks interesting.
5. **Consistency before customization.** One-off visual treatments for a single screen are avoided; the shared system is extended deliberately, not bypassed locally.
6. **Context before data.** A number without its frame of reference (what it's compared to, over what period, from what source) is incomplete, not just terse.
7. **Trust is a visual property.** How something is shown affects whether it's believed — see §9.

## 9. Design for Trust

This section is a **Z Operating System principle**, developed specifically for this ecosystem — it extends beyond what Z Imobiliária's public marketing pages currently need, because the Z Operating System surfaces evidence, assessments and data in a way a real-estate marketing site does not.

The interface must make visible, wherever relevant:

- the origin of data being shown;
- when it was last updated;
- the level of confidence behind a figure or assessment;
- the distinction between a fact and an estimate;
- the distinction between an observed data point and a derived/calculated one;
- known limitations, stated rather than hidden.

The interface must never manufacture false confidence through:

- artificially precise numbers where the underlying evidence doesn't support that precision;
- scores or ratings presented without explanation;
- decorative charts that imply more analytical depth than exists;
- absolute language ("always," "guaranteed," "the best") where the evidence only supports a qualified claim.

Visual trust is the product of **clarity + provenance + consistency + honesty** — never of visual weight or polish alone. This directly extends the Trust Engine's evidentiary principles (see `30-trust-engine`, once written) into the interface layer: an interface that hides uncertainty undermines a Trust Engine that was built specifically to make evidence and confidence explicit.

**Human Accountability.** When a system uses AI-generated content, AI-assisted analysis, automated scoring, or algorithmic recommendations, the interface should, where relevant, make visible: the assisted or automated nature of the output; whether human review has occurred, when applicable; and the distinction between *generated*, *assisted*, *verified* and *approved* states. This document does not define a specific implementation or component for this — it establishes the principle that **interfaces should not obscure the boundary between automated assistance and human accountability**, consistent with `00-foundation/PRINCIPLES.md`'s Human Accountability and AI-Assisted, Human-Governed principles.

## 10. Relationship with Z Operating System Principles

```
00-foundation/PRINCIPLES.md
        ↓
defines the system principles

architecture/DESIGN-SYSTEM.md
        ↓
defines how those principles become visible and usable
```

This document is **not** the original source of the principles of trust, provenance, evidence, or accountability that appear throughout it — those are defined once, in `00-foundation/PRINCIPLES.md`, and this document translates them into visual and interaction rules. Where this document states a trust- or evidence-related rule, it is applying a Foundation principle to the interface layer, not inventing a new one. If a future principle needs restating here for clarity, it should reference `00-foundation/PRINCIPLES.md` rather than redefine it.

## 11. Relationship with Z Imobiliária

Using the terminology already canonical in `GLOSSARY.md` (Company, Brand, Product): Z Imobiliária is a **Company** represented in the Registry. Its brand expression and its market-facing products are not identical to the Company itself — they are what the Company produces and presents.

```
Z Operating System
        │
        ├── Core principles
        ├── Shared capabilities
        ├── Core design foundations
        │
        └── Z Imobiliária
                │
                ├── Company
                ├── Brand expression
                ├── Real-estate product experiences
                └── Market-facing interfaces
```

**Z Imobiliária** (as Company, expressed through its Brand and Products) privileges: emotion, desire, lifestyle, architecture, discovery, properties, narrative, commercial trust.

**Z Operating System** privileges: structure, evidence, data, systems, workflows, decisions, intelligence, transparency, traceability.

Both share: the same typographic pairing logic, the same chromatic logic, the same sense of containment, the same quality of execution, the same respect for space, the same language of trust — inherited from the Z Design Foundations in §2, not from Z Imobiliária's specific implementation of them.

**Rule: same DNA, different expression.** Z Imobiliária may be more editorial and aspirational. The Z Operating System may be more structured and informative. Neither should read as belonging to a different brand than the other — but this is achieved by both sharing Layer A (Foundations), not by the Z Operating System adopting Z Imobiliária's Layer B tokens wholesale.

**Open limitation, not resolved here:** `GLOSSARY.md` currently defines Company → Brand → Product as a general model but does not yet spell out, for Z Imobiliária specifically, which of its sub-brands (e.g. "Coleção Privada") are Brands versus Products in that model. This document does not redefine or extend the Glossary to resolve that — it is noted as a follow-up need (see final report).

## 12. Relationship with 130-design

- **`architecture/DESIGN-SYSTEM.md`** (this document) is the cross-cutting operational reference. It answers: *how should the system be visually built?* It holds tokens, rules of use, and component-level conceptual guidance, applicable across websites, dashboards, internal tools, future products, applications, and documentation surfaces.
- **`130-design/README.md`** holds design thinking, principles and discipline. It answers: *how do we think about design, experience, and design decisions?*

These responsibilities are not duplicated: this document does not philosophize about design values (that's `130-design`'s role), and `130-design` does not define specific tokens, hex values, or component rules (that's this document's role). Where `130-design` develops future content, it should reference this document for anything concrete rather than restating tokens locally.

## Status
Draft

## Last Updated
2026-07-19

## Related Domains
- `130-design`
- `90-platform-engineering`
- `10-company`
- `00-foundation`
