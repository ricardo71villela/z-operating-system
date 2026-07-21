# Intelligence Model

## Purpose
Defines what the Intelligence domain owns, what it explicitly does not own, and how it turns Data, Knowledge and Research into predictions, recommendations, classifications, rankings and other decision-support outputs — without becoming a second Data system, a second Trust Engine, or the owner of any other domain's decisions.

## Scope
The definition of Intelligence, its inputs and outputs, the Model → Execution → Output relationship, temporality and provenance, and its boundaries with Registry, Data, Trust Engine, Partner Quality Score, Marketplace, Research and Knowledge Hub. Does not define specific algorithms, technology choices, or ML infrastructure — this repository never does. Does not define trust evaluation — see `30-trust-engine/TRUST-MODEL.md`. Does not define raw observations — see `60-data/DATA-MODEL.md`.

## Table of Contents
- [Definition of Intelligence](#definition-of-intelligence)
- [What Intelligence Owns](#what-intelligence-owns)
- [What Intelligence Does Not Own](#what-intelligence-does-not-own)
- [Inputs](#inputs)
- [Outputs](#outputs)
- [Model, Execution and Output](#model-execution-and-output)
- [Lifecycle and Temporality](#lifecycle-and-temporality)
- [Provenance, Explanation and Decision](#provenance-explanation-and-decision)
- [Boundaries with Data](#boundaries-with-data)
- [Boundaries with Trust Engine](#boundaries-with-trust-engine)
- [Boundaries with Partner Quality Score](#boundaries-with-partner-quality-score)
- [Boundaries with Marketplace](#boundaries-with-marketplace)
- [Boundaries with Research and Knowledge Hub](#boundaries-with-research-and-knowledge-hub)
- [Boundaries with Registry](#boundaries-with-registry)
- [Governance](#governance)
- [Security and Legal Constraints](#security-and-legal-constraints)
- [Authority Map](#authority-map)
- [Minimum Conceptual Model](#minimum-conceptual-model)
- [Open Architectural Questions](#open-architectural-questions)

---

## Definition of Intelligence

**Intelligence is the Z Operating System's enabling capability for deriving algorithmic or analytical interpretations from Data, Knowledge, Research and other governed inputs, producing predictions, recommendations, classifications, rankings, scores, optimizations, or other decision-support outputs.**

This tests, and confirms with corrections, the definition proposed for this phase: Intelligence is an **enabling domain**, not a product-facing one — it transforms inputs into derived outputs; it is not a canonical source of identity, not the owner of raw observations, not the owner of evidence, not the owner of trust assessments, and not the owner of any business decision. It may provide inputs to any domain that owns a decision, but authorship of an output is never authority over what happens with it.

AI/ML is one implementation tool within Intelligence, never a synonym for it (`GLOSSARY.md#artificial-intelligence`) — this document does not introduce AI/ML terminology beyond what is architecturally necessary.

## What Intelligence Owns

- Its own outputs, as artifacts of authorship: Prediction, Recommendation, Classification, Ranking Score, Forecast, Anomaly/Detection Output, Optimization Output (see [Outputs](#outputs)).
- The Model, Execution and Output objects that produce and record those artifacts (see [Model, Execution and Output](#model-execution-and-output)).
- The provenance and explanation attached to its own outputs.

## What Intelligence Does Not Own

- **Registry identity** — Entity identity, Asset identity, Canonical Record, Relationships, Representation, State, History, External References all remain exclusively Registry's, per `20-registry/ENTITY-ASSET-MODEL.md`.
- **Raw observations** — Observation, Dataset, Aggregate remain exclusively Data's, per `60-data/DATA-MODEL.md`.
- **Evidence and trust** — Evidence, Verification, Signal, Assessment, Trust Level remain exclusively Trust Engine's, per `30-trust-engine/TRUST-MODEL.md`.
- **Partner Quality methodology and Score** — remain exclusively `40-partner-quality-score`'s, per `PARTNER-QUALITY-SCORE-MODEL.md`.
- **Marketplace decisions** — Listing, Discovery, Marketplace Decision, visibility/ranking policy, Enquiry, Offer, Transaction state remain exclusively Marketplace's, per `50-marketplace/MARKETPLACE-MODEL.md`.
- **Strategic research conclusions** — Research's own analytical output remains Research's, per `145-research/README.md`.
- **Curated public knowledge** — Knowledge Hub's own published content remains Knowledge Hub's, per `70-knowledge-hub/README.md`.
- **Cross-domain governance authority** — belongs to `110-governance`.

## Inputs

| Input | What Intelligence may consume | Direct object or derived representation | Source stays authoritative? | May Intelligence modify the source? |
|---|---|---|---|---|
| Data Observations | Yes | Direct (read) | Yes — Data | No |
| Datasets | Yes | Direct (read) | Yes — Data | No |
| Aggregates | Yes | Direct (read) | Yes — Data | No |
| Knowledge Hub content | Yes, as context | Direct (read) | Yes — Knowledge Hub | No |
| Research outputs | Yes | Direct (read) | Yes — Research | No |
| Registry identity and current state | Yes, by reference | Reference only, never copied as a parallel record | Yes — Registry | No |
| Trust Assessments / Trust Levels | Yes, where appropriate | Direct (read) | Yes — Trust Engine | No |
| Marketplace state and activity | Yes, where appropriate | Direct (read) | Yes — Marketplace | No |
| External governed inputs (e.g. third-party datasets) | Yes, where permitted by Security/Legal & Compliance | Direct (read), subject to Source rules in `60-data/DATA-MODEL.md#core-concepts` | Yes — the external Source | No |

**The governing rule throughout: Intelligence consumes inputs; it never becomes the owner of those inputs.** Every row above is read-only from Intelligence's side.

## Outputs

Conceptual output categories: Prediction, Recommendation, Classification, Ranking Score, Forecast, Anomaly/Detection Output, Optimization Output. These are **types of one underlying object — Intelligence Output** (see [Minimum Conceptual Model](#minimum-conceptual-model)) — not separate first-class domain objects each. Creating a distinct object per output type would be unnecessary proliferation; a `type` attribute on Intelligence Output is sufficient until real content proves otherwise.

**None of these is automatically:** a Registry Entity, a Data Observation, Evidence, a Trust Signal, a Trust Assessment, or a Marketplace Decision. Concretely, testing the example this phase specifies: if Intelligence computes *"Property X has a predicted sale probability of 78%,"* that is an **Intelligence Output** — not an Observation, not an Aggregate. It may be persisted for auditability and explainability, but if persisted, it is persisted as an Intelligence Output, never deposited into Data's Observation stream (`60-data/DATA-MODEL.md` already forbids this explicitly). **The consuming domain determines how an Intelligence Output is used** — Intelligence itself never decides.

## Model, Execution and Output

Three distinct concepts, deliberately not collapsed into one:

```
Model (versioned)
   ↓
Execution — a specific run of a Model Version, against specific inputs, at a specific time
   ↓
Output(s) — the result(s) of that Execution
```

**Why Execution is kept distinct from Output, not merged into it:** a single Execution (e.g. a batch run) can legitimately produce many Outputs — a price-prediction model run once can produce a predicted price for thousands of Properties in one Execution. Collapsing Execution into Output would lose the ability to trace many Outputs back to the one run that produced them together, with the same inputs and the same Model Version.

**Why Model is kept as its own concept, not just a string on Output:** Model has its own lifecycle independent of any single Execution — it is validated, deployed, and eventually retired (see [Governance](#governance)), and multiple Executions reference the same Model Version over time.

None of the three is a Registry Entity, a Data object, or a Trust Engine object — all three are Intelligence's own conceptual objects.

## Lifecycle and Temporality

No new timestamp taxonomy is introduced beyond what is architecturally necessary — time is treated as attributes and provenance, not as separate objects, consistent with `60-data/DATA-MODEL.md`'s own temporal model.

An Output carries: input time (the time of the Data/Knowledge/Research it was computed from), execution time (when the Model Version ran), and, where applicable, a validity period and an expiration. The example this phase specifies is fully representable this way: a price prediction made on 20 July 2026 using Data available on 15 July 2026 and Model v3.2 is distinguishable, by these attributes alone, from a prediction made on 20 August 2026 using updated Data and Model v3.3 — no additional object is required.

Outputs are never deleted for being superseded — a new Output from a new Execution does not erase the old one; it becomes historical, consistent with the system-wide History-preservation principle already established in `60-data/DATA-MODEL.md` and `30-trust-engine/TRUST-MODEL.md#temporality-and-decay`.

## Provenance, Explanation and Decision

Three distinct layers, illustrated concretely:

- **Provenance** — where the output came from: *"Model v4.1, trained on Dataset X, executed on date Y."*
- **Explanation** — why the output has the result it has: *"High demand, location, price and historical conversion contributed most."* (Available to the degree the underlying Model supports interpretability — not every Model can produce this to the same depth; where it cannot, that limitation is itself part of the output's provenance.)
- **Decision** — what a consuming domain does with the output: *"Promote listing"* (a Marketplace Decision) — never Intelligence's own territory.

Every meaningful Intelligence Output should be traceable, where applicable, to: the Model and Version used, the inputs (Datasets, Observations, Knowledge, Research) it drew on, execution time, output time, applicable assumptions, and known limitations.

## Boundaries with Data

Per `60-data/DATA-MODEL.md#data--intelligence`: Intelligence consumes Observations and Aggregates; it never produces them. The flow is strictly one-directional, Data → Intelligence. A model's Output — however observation-like it may read ("predicted sale probability of 78%") — is never deposited into Data's Observation stream, because doing so would blur what was observed with what was inferred, the exact confusion the system's Data model was built to prevent. Intelligence preserves its own Output history, structurally parallel to Data's History, never merged into it.

## Boundaries with Trust Engine

Per `30-trust-engine/TRUST-MODEL.md#boundaries`: an Intelligence Output may become a candidate **input** to Trust Engine's Evidence Evaluation step — subject to the same relevance-and-provenance filter any Data Observation faces — but it is never automatically Evidence, a Signal, or an Assessment.

Concretely: *"Predicted likelihood of late payment: 12%"* is an Intelligence Output. Trust Engine evaluates it, alongside other Evidence and Signals, according to its own methodology, and produces a Trust Assessment / Trust Level. The Intelligence Output is not itself a Trust Assessment — **"AI predicts a Partner is reliable" never automatically becomes "Partner is trusted."**

Conversely, Trust Engine may publish a Trust Level ("Trust Level: High") that Intelligence consumes as one input among others for a recommendation or ranking. Neither domain absorbs the other in either direction.

## Boundaries with Partner Quality Score

Per `40-partner-quality-score/PARTNER-QUALITY-SCORE-MODEL.md#relationship-with-intelligence`, this boundary is already established and is reaffirmed, not altered, here. The full chain, with no domain skipping a step:

```
Intelligence: "Predicted partner response time."
   ↓
Trust Engine: evaluates as candidate Evidence, produces Signals/Assessment via its generic mechanism
   ↓
Partner Quality Score: governed methodology determines whether/how this contributes to the published Score
   ↓
Marketplace: uses the resulting Score according to Marketplace policy
```

Intelligence may provide analytical inputs to this chain. It does not own Partner Quality Score, and Partner Quality Score does not become an AI model merely because Intelligence may contribute an input to it.

## Boundaries with Marketplace

Per `50-marketplace/MARKETPLACE-MODEL.md`, Intelligence may provide a recommendation score, a relevance score, a ranking score, predicted conversion, predicted demand, or a matching output — all as algorithmic scores, never as the decision itself:

```
Intelligence: "Listing relevance score = 0.91."
Marketplace: "Given policy, trust, availability and business rules, place Listing A above Listing B."
```

The three layers stay distinct: **algorithmic score** (Intelligence) → **business policy** (Marketplace's own rules) → **final decision** (Marketplace's own act). Intelligence never owns the Marketplace Decision.

## Boundaries with Research and Knowledge Hub

Research (human/analyst-led strategic study) and Intelligence (systematic/algorithmic interpretation) may consume each other's outputs without either owning the other: Research may use an Intelligence forecast as input to a market study; Intelligence may consume a Research benchmark as a training or reference input. A human-authored strategic conclusion is not automatically a model output, and an algorithmic forecast is not automatically Research — no linear pipeline is forced between them.

Knowledge Hub content may be consumed by Intelligence as context, and Intelligence may produce candidate/draft content — but that draft only becomes Knowledge once curated (selected, interpreted, and framed for an audience, per the definition already established in `60-data/DATA-MODEL.md#data--knowledge-hub-and-research`). Intelligence does not publish directly into Knowledge Hub as final content.

## Boundaries with Registry

Per `20-registry/ENTITY-ASSET-MODEL.md`, Intelligence may propose or infer something about an Entity — for example, flagging that two records may represent the same Asset — but it must never become the authority for that Entity's identity:

```
Intelligence: proposes a possible duplicate
Registry: governs canonical identity and resolution, using its own uncertain-identity and merge principles
```

This is fully consistent with One Asset, One Canonical Record: Intelligence never creates Entities or Assets, never modifies a Canonical Record, never creates Relationships or External References, and never changes Representation or Asset state.

## Governance

Intelligence maintains its own internal model governance concepts — Model version, validation, evaluation, deployment, retirement — as part of the Model/Execution/Output structure above. This is not a parallel Governance domain: **approval of a Model for production use, and any change to a Model or its methodology that has cross-domain impact (feeding Trust Engine, Partner Quality Score, or Marketplace), follows `110-governance`'s existing authority** — the same discipline already established for Partner Quality Score's own methodology approval (`PARTNER-QUALITY-SCORE-MODEL.md#governance`). Intelligence may propose a Model or a methodology change; Governance approves it where cross-domain impact exists.

The repository does not yet define the full operational governance of models (validation criteria, deployment gates, retirement process in detail) — this is recorded as an Open Architectural Question, not invented here.

## Security and Legal Constraints

No new security or legal framework is created here; these remain cross-cutting constraints Intelligence must operate within, per `100-security/README.md` and `160-legal-and-compliance/README.md`:

- Sensitive inputs (e.g. data drawn from a Person Entity) remain subject to Security's access-control authority.
- Personal data used as Intelligence input or appearing in an Intelligence Output remains subject to Legal & Compliance.
- A Model Output may itself be sensitive even when its inputs were not (e.g. an inferred attribute) — this inference risk is a Legal & Compliance concern, not resolved here.
- Retention and deletion rules for Model inputs and Outputs are Legal & Compliance's authority, referenced, not defined, here.
- External models or third-party AI services introduce data-transfer and vendor risk, which is a Security and Legal & Compliance concern, not an Intelligence architectural decision.

## Authority Map

| Concern | Authoritative Domain | Intelligence Role |
|---|---|---|
| Entity identity | Registry | Consumes |
| Asset identity | Registry | Consumes |
| Observation | Data | Consumes |
| Dataset | Data | Consumes |
| Aggregate | Data | Consumes |
| Research conclusion | Research | May consume; may also be consumed by Research |
| Curated public knowledge | Knowledge Hub | May consume; may supply drafts for curation |
| Evidence | Trust Engine | May supply a candidate input only |
| Trust Assessment | Trust Engine | May consume |
| Trust Level | Trust Engine | May consume |
| Model | Intelligence | Owns |
| Model Version | Intelligence | Owns |
| Execution / Inference | Intelligence | Owns |
| Prediction, Recommendation, Classification, Ranking Score, Forecast, Optimization Output | Intelligence | Owns (as Intelligence Output types) |
| Partner-specific assessment methodology | Partner Quality Score | Does not own; may supply inputs |
| Marketplace Decision | Marketplace | Does not own; may supply algorithmic score as input |
| Governance Decision | Governance | Does not own; may propose Model/methodology changes |
| Legal compliance | Legal & Compliance | Does not own |

## Minimum Conceptual Model

The smallest coherent set, tested against the candidate list for this phase:

- **Model** — the algorithm/method, versioned over time. First-class, because it has its own lifecycle (validate, deploy, retire) independent of any single run.
- **Model Version** — a specific, deployed iteration of a Model. Kept as an attribute of Model's own versioning, not a separate top-level object.
- **Execution** — a specific run of a Model Version, against specific inputs, at a specific time. First-class, because one Execution can produce many Outputs.
- **Intelligence Output** — the result of an Execution; one object with a `type` attribute (Prediction, Recommendation, Classification, Ranking Score, Forecast, Anomaly, Optimization), not a separate object per type.
- **Output Provenance** — kept as attributes on Intelligence Output (Model Version, inputs, execution time), not a separate object.
- **Evaluation** — kept as part of Model's governance lifecycle (see [Governance](#governance)), not a separate top-level object at this stage.

This rejects treating all six candidate concepts as first-class objects — only Model, Execution and Intelligence Output earn that status; Model Version, Provenance and Evaluation are attributes/lifecycle states of those three.

## Open Architectural Questions

- What is the precise canonical object for a persisted Intelligence Output — is "Intelligence Output with a `type` attribute" sufficiently granular, or will some output types (e.g. Forecast, with its own time-horizon semantics) eventually need their own object?
- When should an Intelligence Output be persisted versus recomputed on demand?
- Is a Model a Registry Entity? This document's position is **no** — but the question of whether a *third-party model provider* should be represented as a Registry Entity (similar to a Data Source being promoted to one, per `60-data/DATA-MODEL.md#core-concepts`) remains open.
- How are external AI/ML models and vendors represented architecturally, beyond the general Security/Legal & Compliance constraints already stated?
- How are model evaluations governed in operational detail (validation criteria, deployment gates)? Recorded as open per [Governance](#governance).
- What level of explainability is required, per output type, and who decides that requirement?
- How are sensitive inferences (an Output that infers something about a Person not directly stated in its inputs) handled specifically?
- How are model outputs shared across Companies, if at all?
- What is the boundary between Intelligence and future Operations analytics (`120-operations`'s own metrics/KPIs)?
- Who approves consequential model changes in practice, beyond "Governance approves cross-domain impact" stated at the principle level?
- How are model failures or degraded confidence represented and surfaced to consuming domains?
- What happens when two Models produce conflicting Outputs for the same question?

**Resolved by existing architecture, not left open:** Intelligence outputs can never become Data Observations (`60-data/DATA-MODEL.md` already forbids this); a Score is not always an Intelligence output (Trust Engine and Partner Quality Score can also produce Scores, per `GLOSSARY.md#score`); Intelligence vs. AI/ML is already settled by `GLOSSARY.md#artificial-intelligence`.

## Status
Draft

## Last Updated
2026-07-20

## Related Domains
- `60-data`
- `30-trust-engine`
- `40-partner-quality-score`
- `50-marketplace`
- `20-registry`
- `145-research`
- `70-knowledge-hub`
- `110-governance`
- `100-security`
- `160-legal-and-compliance`
