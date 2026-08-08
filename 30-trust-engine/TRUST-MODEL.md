# Trust Model

## Purpose
Defines Trust as a system-level, evidence-based, explainable concept — not a partner rating, not a reputation score. This is the conceptual pipeline every Trust Subject in the ecosystem is evaluated through, and the model `40-partner-quality-score` builds on rather than duplicates.

## Scope
Trust Subjects, the Claim → Evidence → Verification → Signal → Assessment pipeline, the Truth/Trust/Confidence/Verification distinctions, temporal and negative-information handling, and the Trust Engine's boundaries with Registry, Data, Partner Quality Score, and Marketplace. Does not define partner-specific scoring formulas — see `40-partner-quality-score`. Does not define legal due-process policy — see `160-legal-and-compliance`. Does not define security controls for evidence storage — see `100-security`.

## Table of Contents
- [What Trust Is, and Is Not](#what-trust-is-and-is-not)
- [Trust Subjects](#trust-subjects)
- [The Evidentiary Pipeline](#the-evidentiary-pipeline)
- [Truth, Verification, Confidence, Trust](#truth-verification-confidence-trust)
- [Signals](#signals)
- [Assessment and Trust Level](#assessment-and-trust-level)
- [Temporality and Decay](#temporality-and-decay)
- [Negative Information](#negative-information)
- [Boundaries](#boundaries)
- [Core Principles](#core-principles)

---

## What Trust Is, and Is Not

**Trust is the domain that turns Claims and Evidence about a Trust Subject into explainable, traceable Assessments of trustworthiness**, by applying Trust Models that weigh Signals derived from verified, provenance-carrying information over time.

It is **not** any single one of: a scoring system (Score is one narrow output format, not the mechanism); a reputation system (reputation aggregates opinion/popularity — Trust Engine explicitly does not); a review/rating system (no user-generated star ratings); a verification system alone (verification is one input it consumes); a rules engine in the narrow sense (it applies rules, but the evidentiary model is the core value); or a decision-support layer that decides. **This last distinction is the most important: Trust Engine stops at the Assessment.** It does not rank listings, approve partners, or flag accounts — those are Decisions made by `50-marketplace` or `110-governance`, informed by the Assessment.

## Trust Subjects

A **Trust Subject** is any Entity or claim-bearing object the ecosystem needs to express a trust position about. Not all Trust Subjects behave alike:

| Category | Examples | Behavior |
|---|---|---|
| **Entity Subjects** | Organizations, Companies, Brands, Partners, Properties, Developments — all Registry Entities per `20-registry/ENTITY-ASSET-MODEL.md` | Trust *accumulates* over time against a stable Identity. |
| **Claim/Content Subjects** | Individual Claims, Documents, Listings-as-assertions, Data points, Sources | Evaluated *per item*, often ephemeral, not cumulative. |
| **Interaction/Process Subjects** | Transactions, Representations (as claims of authority — see `20-registry/ENTITY-ASSET-MODEL.md#relationship`), Predictions | Concerns the reliability of an outcome or process, not an accumulated identity. |

**Users/People as Trust Subjects** are deliberately out of scope until the Registry's Person model (see `20-registry/ENTITY-ASSET-MODEL.md#partner-person`) is exercised by real data — evaluating individuals requires the Legal & Compliance safeguards in `160-legal-and-compliance` to be in place first, not assumed.

## The Evidentiary Pipeline

```
Source
   ↓ (produces)
Claim / Observation / Document
   ↓ (relevance judgment)
Evidence
   ↓ (provenance & quality judgment)
[insufficient → discarded, retained but unused, never deleted]
   ↓ sufficient
Verification Event (optional, method-specific)
   ↓
Signal (typed, polarity, weight, freshness)
   ↓ (Trust Model applies)
Assessment
   ↓ (expressed as)
Trust Level (with explanation)
   ↓ (consumed, outside Trust Engine, by)
Decision (Marketplace / Governance)
```

Definitions, deliberately kept distinct:

- **Claim** — an assertion made by an actor about a Trust Subject. Unverified by default.
- **Observation** — a directly recorded data point (Data domain territory; may become Evidence).
- **Source** — the origin of a Claim, Observation, or Document (internal, external/regulatory, or self-reported). See also `20-registry/ENTITY-ASSET-MODEL.md#external-reference` for Source in its Registry sense.
- **Document** — a specific artifact that may serve as Evidence, carrying its own Provenance.
- **Evidence** (see `GLOSSARY.md#evidence`) — a Claim/Observation/Document judged *relevant* to a specific assessment question, with sufficient Provenance. Not automatic — see [Boundaries](#boundaries).
- **Verification Event** — a specific, method-stated act of checking a Claim/Document against a Source, producing an outcome with its own Provenance (who, when, method, and the method's inherent reliability).
- **Signal** (see `GLOSSARY.md#signal`) — a discrete, typed unit derived from Evidence that feeds an Assessment.
- **Assessment** — the synthesis of multiple Signals for one Subject at one point in time, via a Trust Model.
- **Score** (see `GLOSSARY.md#score`) — one possible numeric expression of part of an Assessment, never a synonym for it.
- **Decision** — a downstream action taken by a consuming domain. **Not produced by Trust Engine.**

## Truth, Verification, Confidence, Trust

Four concepts, never collapsed into one another:

- **Truth** — an unknowable absolute the system never claims to possess directly.
- **Verification** — a specific, method-stated act of checking a Claim against a Source. Its strength depends entirely on the method — checking against a government registry API is strong; checking a self-uploaded PDF is weak. Every Verification Event records its method and that method's strength rating. **"Verified" is never a bare boolean.**
- **Confidence** — a calibrated degree of belief in a Signal or Assessment: a function of evidence quality, verification method strength, freshness, and corroboration.
- **Trust** (see `GLOSSARY.md#trust`) — the ecosystem's expressed, explainable position on a Subject, synthesized from Confidence across multiple Signals over time, always paired with explanation, always reversible.

**"Verified = True" is only ever implied when the verification method's stated strength justifies it** — an explicit, documented rule, never an assumption left implicit in interface language (see also `architecture/DESIGN-SYSTEM.md#9-design-for-trust`).

## Signals

A **Signal** is a discrete, typed, evidenced observation judged relevant to a Subject's trustworthiness, carrying polarity, weight, freshness, and provenance — across four independent axes:

- **Origin:** self-reported / platform-observed / third-party-verified / regulatory-sourced / independently corroborated.
- **Polarity:** positive / negative / neutral-informational.
- **Category:** Identity, Documentation, Compliance, Historical Consistency, Behavioral/Conduct, Data Quality, Responsiveness, Transactional Outcome.
- **Temporal:** point-in-time event vs. recurring/ongoing pattern.

Non-negotiable distinctions, preserved as explicit system states:

- **No evidence ≠ Negative evidence.** Absence renders as an explicit "Not Assessed" state — never a default-to-negative null.
- **Unverified ≠ False.** "Pending/Unverified" is distinct from "Verification Failed."
- **Old evidence ≠ Current evidence.** Freshness changes *weight*, never triggers silent deletion.
- **Contradictory evidence is surfaced, not silently resolved.** An Assessment can carry a "Conflicting Evidence" state as a first-class explainable outcome.

## Assessment and Trust Level

Evidence → Signal requires an explicit **Evidence Evaluation** step (relevance + provenance sufficiency judgment) — this is what prevents every Data point from silently becoming a Signal (see [Boundaries](#boundaries)).

Output formats, each reserved for a different job:

- **Trust Level (qualitative, tiered)** — the default output for general Trust Subjects, always paired with an evidence checklist and stated limitations (e.g. `Trust level: High — ✓ identity verified ✓ documentation verified ⚠ last verification 11 months ago`). Never a bare number.
- **Score (numeric)** — reserved for narrow, single-purpose evaluations with a genuinely explainable formula (Partner Quality Score's territory) — never a stand-in for general Trust.
- **Confidence (High/Medium/Low or numeric)** — attached to individual Signals or Assessments, expressing evidence reliability, kept separate from the trust conclusion itself.
- **Risk classification** — reserved for `160-legal-and-compliance`-relevant handling of confirmed negative signals.
- **Decision thresholds** — belong to the *consuming* domain (e.g. Marketplace deciding what Trust Level surfaces by default), never to Trust Engine.

## Temporality and Decay

- Every Signal carries Freshness; Signals **decay in weight** as they age — never deleted.
- Some Signal types **expire outright** and require re-verification (e.g. a regulatory license check), category-specific, not universal.
- Assessments are themselves time-stamped states, preserved historically in parallel with Registry's History mechanism (see `20-registry/ENTITY-ASSET-MODEL.md#relationship-state-and-history`) — same principle, not the same store.
- New contradictory evidence triggers a **Reassessment** (a new Assessment, Provenance-linked to what triggered it), never a silent overwrite.

## Negative Information

Six distinct states, each with a different evidentiary bar and different Signal implication:

| State | Effect on Assessment |
|---|---|
| Allegation | Recorded; must NOT alone produce a negative Signal. |
| Complaint | Recorded via a defined process; at most a neutral/informational Signal. |
| Investigation | Its *existence* may be surfaced transparently; its *outcome*, not its existence, drives polarity. |
| Confirmed Event | The point at which negative Signal weight applies. |
| Pattern | Multiple Confirmed Events of similar type — a distinct, higher-order Signal. |
| Sanction | Strongest negative category, highest evidentiary bar, typically an external/regulatory Source. |

Minimum architectural safeguards (not legal policy — see `160-legal-and-compliance`): **right of response** (the Subject's contestation is recorded before it materially affects weight); **proportionality** (weight scales strictly with confirmation level); **time-bound review** (Allegations/Complaints/Investigations have a defined re-review or expiry point); **human accountability** (any material negative Assessment change traces to a human-governed process, per `00-foundation/PRINCIPLES.md`).

## Boundaries

**Trust Engine ↔ Registry.** Registry owns identity, canonical entities, relationships, state/history. Trust Engine owns Evidence, Signals, Assessments, Trust Models. An Assessment is **not** a Registry Entity — it *references* a Registry Entity's Identity but lives and is historically preserved within Trust Engine's own model. Registry is authoritative for "does this Entity exist and what is its current state"; Trust Engine is authoritative for "what do we currently assess about this Entity's trustworthiness, and why."

**Trust Engine ↔ Data.** Not every Data point becomes Evidence (must be judged relevant first); not every Evidence becomes a Signal (may be judged insufficient in provenance/quality):

```
Data point → (relevance filter) → Evidence → (provenance/quality filter) → (Trust Model evaluation) → Signal
```

**Trust Engine ↔ Partner Quality Score.** Trust Engine is generic infrastructure — Trust Subjects, Evidence, Signals, Assessments, Trust Models, applicable to any Subject category. **Partner Quality Score is a specific Assessment Model instance of Trust Engine, parameterized for the Partner Subject category, extended with partner-specific operational Signals** (responsiveness, listing completeness) that may never apply to a Property or Company Subject. PQS consumes Trust Engine's machinery; it does not duplicate it. This remains an **Open Architectural Question** per `00-foundation/DOMAIN-MODEL.md` — not merged, boundary sharpened, not resolved.

**Trust Engine ↔ Marketplace.** Trust Engine has no concept of payment as an input, structurally — paid promotion is Marketplace-only, architecturally separate from Trust indicators. Marketplace decides how much weight Trust gets in ranking (a Marketplace/Governance policy decision); Trust Engine only ever supplies the Assessment, never controls visibility directly.

## Core Principles

Trust must be: **explainable** (an Assessment without its Signals is not a valid output); **evidence-based** (no Assessment without underlying Evidence); **contextual** (a Trust Subject category changes what evidence is relevant); **time-aware** (Freshness always tracked); **reversible** (new evidence can always change an Assessment); **provenance-aware** (every fact traces to its origin); **auditable** (every Assessment's history is preserved, never overwritten). Trust must never be confused with popularity, must never be bought, and must never be fabricated. These are Trust Engine's own operating principles — they apply `00-foundation/PRINCIPLES.md`'s system-wide "Trust as a System Property" specifically to this domain's mechanics; they do not restate or replace it.

## Status
Draft

## Last Updated
2026-07-19

## Related Domains
- `20-registry`
- `40-partner-quality-score`
- `60-data`
- `50-marketplace`
- `100-security`
- `160-legal-and-compliance`
- `80-intelligence`
