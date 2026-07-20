# Partner Quality Score Model

## Purpose
Defines what the Partner Quality Score domain owns, and — just as importantly — what it does not. Partner Quality Score is the Partner-specific parametrization and published output of the generic Trust Assessment model. It is not a parallel trust system, not a data system, and not a Marketplace decision.

## Scope
The Partner-specific Assessment Model parametrization, the methodology that defines which Trust Engine Signal categories apply to Partners and how, the Partner Quality Score as a published product artifact, and the publication/explainability rules specific to that Score. Does not define the generic evidentiary or assessment mechanism — see `30-trust-engine/TRUST-MODEL.md`. Does not define raw observations or aggregates — see `60-data/DATA-MODEL.md`. Does not define ranking, visibility, or eligibility decisions — see `50-marketplace/MARKETPLACE-MODEL.md`. Does not define Partner identity — see `20-registry/ENTITY-ASSET-MODEL.md`.

## Table of Contents
- [What Partner Quality Score Is](#what-partner-quality-score-is)
- [What Partner Quality Score Is Not](#what-partner-quality-score-is-not)
- [The Partner Quality Assessment Model](#the-partner-quality-assessment-model)
- [Relationship with Registry](#relationship-with-registry)
- [Relationship with Data](#relationship-with-data)
- [Relationship with Trust Engine](#relationship-with-trust-engine)
- [Relationship with Intelligence](#relationship-with-intelligence)
- [Relationship with Marketplace](#relationship-with-marketplace)
- [Score, Assessment and Trust Level](#score-assessment-and-trust-level)
- [Methodology and Weighting](#methodology-and-weighting)
- [Publication and Temporal Model](#publication-and-temporal-model)
- [Explainability and Provenance](#explainability-and-provenance)
- [Governance](#governance)
- [Authority Map](#authority-map)
- [Minimum Conceptual Model](#minimum-conceptual-model)
- [Open Architectural Questions](#open-architectural-questions)
- [Boundary Rules](#boundary-rules)

## What Partner Quality Score Is
The Partner Quality Score is the published, numeric-or-tiered expression of a Partner-specific Trust Assessment, produced by applying the Trust Engine's generic Assessment mechanism with a methodology parametrized specifically for the Partner Subject category. It answers a narrower question than Trust does in general: not "should this Partner be trusted at all," but "how well does this Partner perform against the specific dimensions — responsiveness, transactional outcome, data quality, conduct — that this ecosystem has defined as Partner Quality."

## What Partner Quality Score Is Not
It is not a second Trust Engine. It does not define its own Evidence, Verification, or Signal objects — it reuses the Trust Engine's existing ones. It is not a Data object — it does not observe, measure, or hold Observations, Metrics, Datasets, or Aggregates. It is not a Registry Entity and has no Canonical Record — it references a Partner's Registry Identity, it does not represent or duplicate it. It is not a Marketplace Decision — it never ranks, hides, or approves a Partner; it only publishes an Assessment output that Marketplace may consume. It is not authoritative over "quality" independent of evidence — every Score must trace back through the same explainability chain the Trust Engine already requires.

## The Partner Quality Assessment Model
The Trust Engine's generic pipeline is unchanged and is not re-implemented here:

```
Source → Claim / Observation / Document → Evidence → Verification → Signal → Assessment → Trust Level
```

Partner Quality Score sits at the parametrization layer of this same pipeline, applied to the Partner Subject category:

```
Partner
   ↓
Registry Identity
   ↓
Data Observations / Aggregates
   ↓
Trust Engine Evidence Evaluation
   ↓
Verification
   ↓
Signals (existing categories: Responsiveness, Transactional Outcome,
         Data Quality, Behavioral/Conduct — see TRUST-MODEL.md)
   ↓
Partner-specific Assessment Model  ← owned by this domain
   ↓
Trust Assessment                   ← produced by Trust Engine, using the above parametrization
   ↓
Partner Quality Score              ← published output, owned by this domain
   ↓
Marketplace Decision               ← owned by Marketplace
```

The Partner-specific Assessment Model does not substitute the Trust Engine's mechanism — it selects which of the Trust Engine's existing Signal categories are relevant to Partner Quality specifically, and defines how they are weighted and composed for that Subject category. No new evidentiary primitives are introduced at this layer.

## Relationship with Registry
A Partner is a Registry Entity — either a Company or a Person, per `20-registry/ENTITY-ASSET-MODEL.md#partner-person`. Partner Quality Score is not a Registry Entity, has no Identity of its own, and has no Canonical Record. It references the Partner it concerns through that Partner's Registry Identity — never by duplicating or re-representing it. No parallel Partner record ("PQS Partner Record") exists or should be created. Changing a Partner's Score never changes the Partner's identity, and changing the Partner's identity data never happens as a side effect of a Score being computed.

## Relationship with Data
This domain reuses `60-data/DATA-MODEL.md`'s existing concepts without redefinition: Observation, Metric, Dataset, Aggregate. Response time, completion rate, cancellation rate, listing accuracy, data completeness, complaint frequency, transaction outcomes, and directly observed or surveyed client satisfaction are all Data — raw Observations or Aggregates about a Partner, owned entirely by the Data domain.

The flow is strictly unidirectional:

```
Data → Trust Engine → PQS assessment methodology → Score
```

**Partner Quality Score never writes back into Data.** No loop exists in either direction — Data is never informed of, adjusted by, or dependent on a published Score.

## Relationship with Trust Engine
The separation is absolute:

| | Owns |
|---|---|
| **Trust Engine** | Evidence Evaluation, Verification, Signal generation, the generic Assessment mechanism, Trust Level, provenance, explainability, reassessment on new evidence. |
| **Partner Quality Score** | Which Partner Quality dimensions are relevant, the Partner-specific parametrization of the Assessment Model, the specific methodology and its weighting/composition, how the published Score represents the underlying Assessment, and the Score's own presentation-level transparency. |

Trust Engine is never described as a ranking or approval system — it assesses, nothing more. Partner Quality Score is never described as a decision system — it publishes an assessment output, nothing more.

## Relationship with Intelligence
An ML-derived prediction, risk indicator, or anomaly signal is not automatically a Partner Quality Score. Intelligence may supply such outputs as **inputs** to the Trust Engine's evidentiary process (one possible Signal input among several), but the semantic authority over what "Partner Quality" means — which dimensions matter, how they're weighted — belongs to this domain's methodology, not to any model. This preserves AI-Assisted, Human-Governed (`00-foundation/PRINCIPLES.md`): a machine-learning model cannot silently redefine what counts as good or poor partner behavior; any such change is a methodology change, and methodology changes are governed (see §15).

## Relationship with Marketplace
Per `50-marketplace/MARKETPLACE-MODEL.md`, Marketplace may consume the Score, define its own thresholds against it, and use it as input to ranking, visibility, and eligibility — always as a Marketplace Decision it owns, never as a verdict it requests from PQS. Marketplace may not ask PQS for a final verdict, delegate eligibility to PQS, treat the Score itself as a decision, automatically convert a low Score into a ban, or assign PQS any authority over a Listing.

**Example, stated exactly at the boundary:**

> Partner Quality Score = 87
> Marketplace policy: Partners with Score < 60 receive reduced visibility.

The Score belongs to PQS. The methodology belongs to PQS. The evidence and generic Assessment belong to Trust Engine. **The decision, and the threshold that triggers it, belong to Marketplace.**

## Score, Assessment and Trust Level
`GLOSSARY.md#score` already defines Score as "one possible numeric expression of part of an Assessment" — this document does not redefine it, only applies it:

**Partner Quality Score = the published numeric or tiered expression of a Partner-specific Trust Assessment.**

The Score is not an Observation, not an Aggregate, not a Signal, not a complete Assessment, not a Trust Level, and not a Marketplace Decision. It must always be explainable through the same chain the Trust Engine already requires:

```
Score → Assessment → Signals → Evidence → Observations / Aggregates → Sources
```

## Methodology and Weighting
This document defines that a Partner-specific methodology exists and where it lives — it does not define the methodology itself. No concrete weights, dimension list, formula, or scale is fixed here; those are implementation and product decisions for a later, separately governed phase. What is fixed here is the rule: any methodology must be expressed entirely in terms of the Trust Engine's existing Signal categories and Assessment mechanism, never as a parallel Quality Evidence, Quality Verification, or Quality Signal system.

## Publication and Temporal Model
No new state machine is introduced. Partner Quality Score reuses the Trust Engine's existing Assessment temporality — Assessments may be recalculated continuously, and new contradictory evidence triggers a Reassessment, never a silent overwrite (per `30-trust-engine/TRUST-MODEL.md#temporality-and-decay`).

What is specific to this domain is the distinction between **Assessment recalculation** and **Score publication**: an Assessment may be recalculated on a different cadence than the Score is published — a published Score is the representation surfaced externally at a given moment, not necessarily identical to the latest possible recalculation. A newly published Score can replace the current representation without erasing history: historical Scores remain preserved for explainability, exactly as historical Assessments and historical Observations are preserved elsewhere in the system.

## Explainability and Provenance
A Partner must be able to understand, for their own Score: which dimensions contributed, which Signals were used, what Evidence supported those Signals, what underlying Observations and Sources they trace to, what methodology was applied, and which version of that methodology. The methodology itself carries its own provenance — every change is proposed, reviewed, approved, documented, and versioned (see §15). A correction to an underlying Observation (per `60-data/DATA-MODEL.md`'s append-only model) propagates as a Reassessment in the Trust Engine, which in turn may produce a new published Score — the prior Score remains historical, never silently replaced.

## Governance
Partner Quality Score may **propose** its methodology and any changes to it. It does not have unilateral authority to adopt those changes. Approval of methodological changes — since they affect a cross-domain assessment mechanism — belongs to `110-governance`, consistent with that domain's own stated Purpose. No methodology change takes effect without having been proposed, reviewed, approved, documented, and versioned through that process.

## Authority Map

| Concept | Authoritative Domain |
|---|---|
| Partner identity | Registry |
| Raw observations | Data |
| Datasets / Aggregates | Data |
| Evidence Evaluation | Trust Engine |
| Verification | Trust Engine |
| Signals | Trust Engine |
| Generic Assessment mechanism | Trust Engine |
| Partner-specific methodology | Partner Quality Score |
| Partner Quality Score (published output) | Partner Quality Score |
| Methodology approval | Governance |
| Ranking | Marketplace |
| Visibility | Marketplace |
| Eligibility decision | Marketplace |
| ML-derived indicators | Intelligence |

**The domain that owns the decision owns the threshold.** Partner Quality Score never owns a Marketplace threshold — it only ever supplies the value a threshold is applied to.

## Minimum Conceptual Model
No object beyond what Trust Engine and Data already define is introduced. The two objects this domain genuinely owns are: the **Partner-specific Assessment Model parametrization** (which Signal categories apply, how they are weighted and composed for Partners) and the **published Partner Quality Score** itself (the product-facing, explainable output). Everything upstream of these two objects belongs to Registry, Data, or Trust Engine; everything downstream belongs to Marketplace.

## Open Architectural Questions
Recorded, not resolved:

- Is the Score global per Partner, or does it vary by Marketplace context or product?
- Can Partner Quality Score be used outside the Marketplace?
- Is the Score public, visible only to Companies, or visible only to the Partner it concerns?
- Can the Score be negative, or should it use a bounded scale?
- Should a formal, PQS-specific contestation process exist, beyond the Trust Engine's general right of response?
- How does GDPR apply when the Partner is a Person rather than a Company?
- How should different Partner categories (agency vs. private seller) be compared, if at all?
- How do Trust Level and Partner Quality Score coexist on a Partner-facing surface?
- What is the exact role of Partner Quality Score in the future Z Marketplace product?

## Boundary Rules
A concise restatement, to be checked against on every future change to this domain:

- Trust Engine assesses; it does not decide.
- Partner Quality Score parametrizes and publishes; it does not assess independently, and it does not decide.
- Data observes; it never receives writes from Trust Engine or Partner Quality Score.
- Registry identifies; Partner Quality Score never represents or duplicates identity.
- Marketplace decides; Partner Quality Score never owns a threshold or a decision.
- Intelligence may supply inputs; it never holds semantic authority over what Partner Quality means.
- Governance approves methodology changes; Partner Quality Score may only propose them.

## Status
Draft

## Last Updated
2026-07-20

## Related Domains
- `30-trust-engine`
- `60-data`
- `20-registry`
- `50-marketplace`
- `80-intelligence`
- `110-governance`
