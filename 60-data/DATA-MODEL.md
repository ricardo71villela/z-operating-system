# Data Model

## Purpose
Defines what Data means within the Z Operating System: its central object, its authority, its temporal and provenance model, and its exact boundaries with Registry, Trust Engine, Marketplace, Intelligence, Knowledge Hub and Research. This is the model every future domain must respect when it produces or consumes observations about Entities and Assets.

## Scope
The Observation-centred conceptual model, the Data Record lifecycle, temporal and provenance handling, and Data Quality as a descriptive (not evaluative) property. Does not define entity identity or authoritative state — see `20-registry/ENTITY-ASSET-MODEL.md`. Does not define trust evaluation — see `30-trust-engine/TRUST-MODEL.md`. Does not define database schemas, pipelines, or technology choices — this repository never does.

## Table of Contents
- [What Data Is, and Is Not](#what-data-is-and-is-not)
- [Authority](#authority)
- [Core Concepts](#core-concepts)
- [Boundaries](#boundaries)
- [Lifecycle](#lifecycle)
- [Provenance and Temporality](#provenance-and-temporality)
- [Data Quality](#data-quality)
- [Open Questions](#open-questions)

---

## What Data Is, and Is Not

**Data is the domain that records observations, measurements and derived aggregates about Entities and Assets over time.** It answers "what has been recorded or measured," never "what exists" (Registry), "is this trustworthy" (Trust Engine), "what does this mean" (Knowledge Hub), "what should happen next" (Intelligence), or "what does this mean for the business" (Research).

Data is **not**: a second identity system (it never creates a Canonical Record); a trust or verification system (it never produces a Signal or an Assessment); a content system (it never publishes curated narrative); a prediction system (it never infers); an internal strategy function (it never produces strategic analysis). Data's entire authority is bounded to recording and transparently aggregating what has been observed.

## Authority

| Concept | Owner |
|---|---|
| Identity, Canonical Record | Registry |
| **Observation, Metric (type), Dataset, Aggregate** | **Data** |
| Source metadata (descriptive) | Data |
| Provenance (descriptive) | Data — evaluated, not just recorded, by Trust Engine |
| Evidence, Verification, Signal, Assessment, Trust Level | Trust Engine |
| Prediction, Recommendation, modeled/weighted score | Intelligence |
| Listing State, Transaction State | Marketplace |
| Curated narrative, published report | Knowledge Hub |
| Internal strategic analysis | Research |
| Data reliability/confidence judgment | Trust Engine |

Data owns the objects in bold above; everything else in this table is either consumed as input or produced by a domain Data itself feeds, never the reverse.

## Core Concepts

The smallest model that supports real estate data, market data, partner data, company data, operational data, and future non-real-estate Assets, without duplicating Registry's or Trust Engine's own primitives:

```
Entity (Registry reference — never owned by Data)
   ↓
Observation — the fundamental object: a single recorded fact about an Entity,
              for a given Metric, at a point in time, from a Source
   ↓
Dataset — a named, bounded collection of Observations sharing schema, source or purpose
   ↓
Aggregate — a value computed by transparent aggregation over Observations
            (average, sum, count, trend) — remains Data-owned only while the
            derivation stays a reproducible aggregation, not a model or inference
```

**Metric**, here, is used exactly as already canonical in `GLOSSARY.md#metric` — *a single, directly measured quantity* (e.g. "asking price," "floor area," "view count"). An **Observation is one recorded instance of a Metric**, for one Entity, at one time, from one Source. This deliberately reuses the existing Glossary term rather than redefining it — see [Open Questions](#open-questions) for the one point still needing ratification.

**Rejected as separate primitives, deliberately:** Measurement, Record, Data Point, Indicator, Snapshot, Time Series, Event, Derived Data. Each of these is either a synonym for Observation (Measurement, Record, Data Point, Indicator), a query-time view over a stream of Observations (Snapshot = many Metrics at one time; Time Series = one Metric over many times), or a concept already owned elsewhere (Event duplicates Registry's and Marketplace's own History mechanisms — see `20-registry/ENTITY-ASSET-MODEL.md#relationship-state-and-history` and `50-marketplace/MARKETPLACE-MODEL.md#marketplace-state`). Introducing them as first-class objects would fragment one coherent model without adding real capability.

**Source** is metadata attached to every Observation (which system or party produced it) by default — not a Registry Entity. A Source is promoted to a Registry Entity only when the ecosystem needs to track that specific source's identity and reliability over time (e.g. a recurring third-party market-data provider) — at that point, evaluating its reliability becomes Trust Engine's concern, not Data's. An Observation has exactly one Source; corroboration is expressed as multiple independent Observations of the same Metric/Entity/time from different Sources, which Trust Engine may treat as independent corroborating Signals — not as a single multi-source Observation object.

## Boundaries

### Data ↔ Registry

Registry holds only the minimal defining attributes needed for identity resolution (a cadastral reference, geometry, a legal registration number, where they exist); everything else is Data, even attributes that look static:

| Attribute | Owner | Why |
|---|---|---|
| Asset Identity | Registry | Defines which Asset this is |
| Asset location (as identity-resolution attribute) | Registry | Used to resolve identity |
| Asset area | Data | Measured, can vary by source/survey |
| Asset asking price | Data | Observed/asserted value, changes over time |
| Asset market value | Data | Estimated/derived, not authoritative fact |
| Asset historical price | Data | Observation series |
| Asset location (as a geospatial fact for mapping, not identity) | Data | Observed value, distinct from the identity-resolution attribute |
| Asset energy rating | Data | Measured/certified value |
| Asset availability | Marketplace state, referenced by Data as an observed fact when recorded historically | See Marketplace boundary below |
| Asset occupancy | Data | Observed fact |
| Asset views | Data | Observed fact about a Marketplace object |
| Asset enquiry count | Data | Observed fact about a Marketplace object |

**Data never writes to Registry directly.** When an Observation is significant enough to warrant a change in Registry's canonical state (e.g. a different address is repeatedly observed), it does not update Registry automatically. It is recorded as a new Observation; if it becomes Evidence and is assessed by Trust Engine, it may inform a Decision that a human-governed Registry process acts on. Registry's identity only ever changes through its own governed process — never through a Data feed. This is what preserves **One Asset, One Canonical Record**: Data may hold a hundred Observations of one Asset, but never a second identity for it, and Registry is always the reference Data points to, never the other way round.

### Data ↔ Trust Engine

Following the existing pipeline in `30-trust-engine/TRUST-MODEL.md` (`Source → Claim/Observation/Document → Evidence → Verification → Signal → Assessment → Trust Level`):

- **Not every Observation is Evidence.** An Observation becomes Evidence only when Trust Engine's own relevance-and-provenance filter judges it relevant to a specific trust question. Most Observations never become Evidence for anything.
- **Evidence is not a subset of Data.** Claims and Documents that were never Data objects can also be Evidence (a self-reported statement, a legal certificate). Data-sourced Observations are one input type to Evidence, not the only one.
- **The Observation → Evidence transformation belongs to Trust Engine, not Data.** Data never self-declares an Observation as Evidence.
- **Provenance is recorded by Data, evaluated by Trust Engine.** Data attaches descriptive Source and timestamp metadata to every Observation; Trust Engine judges whether that provenance is sufficient and how strong it is for a given trust question. These are different responsibilities over the same fact, not duplication.
- **`Data Quality Score` never silently becomes `Trust Score`.** Data Quality is Data's own descriptive property (see [Data Quality](#data-quality)); it becomes a Trust Signal only when Trust Engine's evaluation process picks it up and interprets it for a specific Assessment.

This preserves: Trust Engine assesses, it does not decide; Data observes, it does not assess trust.

### Data ↔ Marketplace

Marketplace both produces and consumes Data. It produces operational observations about its own objects (a Listing's view count, enquiry count) — these are Data once recorded, even though the object they describe (the Listing) is Marketplace-owned. Marketplace consumes Data (price history, market activity, geographic and demand signals) as one input among several to its own decisions (ranking, presentation), on the same "input, never authority" terms already established for Trust Level in `50-marketplace/MARKETPLACE-MODEL.md#relationship-with-trust-engine`.

**The rule that resolves the ambiguous cases (a Listing's currently displayed price; whether "availability" is Data or Marketplace state):** if the fact is about the **Marketplace's own current workflow/process state**, it is Marketplace state, owned by Marketplace. If the fact is an **observation or measurement about something**, it is Data — even when the something is a Marketplace object, and even when the same value serves both roles at once (the currently displayed asking price is Marketplace state; the same value, once recorded as a fact-at-a-time, is also a Data Observation forming part of the price history).

**Data never becomes a second source of Listing identity.** A Listing is never a Data object — Data may hold Observations *about* a Listing (its view count, its price history) but never owns or duplicates the Listing itself, which remains entirely Marketplace's.

### Data ↔ Intelligence

```
Observed Data (Observation) → Derived Data (Aggregate) → Signal (Trust Engine) → Score / Prediction (Intelligence) → Recommendation (Intelligence)
```

Not every level of this chain belongs to the same domain. Data owns Observation and Aggregate, as long as the aggregation is transparent and reproducible (average, sum, count, trend). The moment a derivation requires modeling, weighting, or inference, ownership shifts to Intelligence — a "market heat score" built from a weighted model is Intelligence, not a Data Aggregate. Intelligence consumes Data (Observations, Aggregates); Data never consumes Intelligence outputs as if they were Observations — the flow is one-directional. A model's prediction is never deposited into Data's Observation stream, because that would blur "what was observed" with "what was inferred." Intelligence preserves its own output history, structurally parallel to Data's own History, but never merged into it.

### Data ↔ Knowledge Hub and Research

Raw Observations, Datasets and Aggregates stay Data. The moment content becomes **curated** — written, interpreted, and prepared for an audience — it leaves Data and becomes either Knowledge Hub (public-facing: guides, reports, tools) or Research (internal-facing: benchmarks, competitive analysis, strategic studies), per the boundary already established in `00-foundation/DOMAIN-MODEL.md`. "Curated" specifically means: a human or an Intelligence process has selected, interpreted, and given the material a narrative or analytical framing intended for a specific audience — not merely queried or aggregated it.

A Knowledge Hub report or a Research study **references** the Data (and Intelligence outputs) that informed it, preserving that provenance chain, but never re-stores the underlying Observations as its own objects. **Research must not become a generic Data warehouse:** if Research starts accumulating independent observational records rather than referencing Data's own Datasets and Aggregates, that is domain creep into Data's territory.

## Lifecycle

**Data lifecycle ≠ Asset lifecycle.** Registry owns the Asset's own state (`Discovered → Identity Pending → Verified → Active → Inactive → Archived`, per `20-registry/ENTITY-ASSET-MODEL.md#state`); Data owns a separate, much smaller lifecycle for its own records, describing only how confidently and currently that record can be relied on as *the* observed value — never touching the Entity's own identity state:

```
Recorded → Validated → Superseded → Archived
```

- **Recorded** — the default state on capture; the Observation exists in the system.
- **Validated** — the Observation has passed Data's own mechanical, structural checks (schema conformance, completeness) — this is **not** a trust judgment and never substitutes for Trust Engine's Verification.
- **Superseded** — a newer Observation of the same Metric/Entity/Source has arrived; this Observation is no longer the current value for that stream. It is never deleted — it remains part of the historical series.
- **Archived** — retained per a Legal & Compliance-driven retention policy, no longer surfaced in default queries.

"Observed" is deliberately not a separate state: the moment a real-world fact happens is captured as Observation time (see below), not as a system state transition Data's own lifecycle passes through.

## Provenance and Temporality

Every Observation preserves four distinct time dimensions, deliberately not collapsed into one "timestamp":

- **Observation time** — when the fact being described actually occurred or was true in the world.
- **Recording time** — when the Observation was entered into the system (may differ substantially from Observation time, e.g. a historical dataset imported today).
- **Effective time** — the period during which the observed value is considered applicable (an asking price is effective from the time it is set until it changes or the Listing is withdrawn).
- **Source publication time** — when the Source itself published or released the information, which may differ from both when the fact occurred and when Z recorded it.

Not every Observation needs all four populated — but the model reserves distinct meaning for each so they are never conflated. Alongside time, every Observation preserves: what was observed (the Metric and value), by whom or what (the Source), and how it was obtained (a short provenance note, e.g. "self-reported," "government API," "field survey"). Nothing in Data is ever deleted for being superseded or old — see [Lifecycle](#lifecycle).

## Data Quality

Data Quality is **descriptive, not evaluative** — a mechanical property Data can measure about its own Observations and Datasets without judgment:

- **Data-native (descriptive):** completeness, freshness, consistency, timeliness, validity, duplication, staleness — all objectively measurable against the Observation/Dataset's own structure and age.
- **Trust Engine's territory (evaluative):** accuracy, reliability, confidence — these require a judgment about whether to rely on the data, which is Trust Engine's role, not Data's.
- **Provenance** sits in both, at different layers, as already established under [Boundaries](#boundaries).

Data Quality metadata may be surfaced to Marketplace (e.g. a low-completeness Observation might reasonably affect how confidently it's displayed) and may be consumed by Trust Engine as input to a Signal — but Data itself never produces a Signal or judges its own reliability. **A Data Quality Score is not a Trust Score** — it becomes an input to one only once Trust Engine's own evaluation process picks it up.

## Open Questions

- **Metric vs. Aggregate terminology** — this document reuses `GLOSSARY.md#metric` as-is (a directly measured quantity) and introduces **Aggregate** as a new term for derived/computed values. This resolves a real tension (a data-domain reader might expect "Metric" to mean "derived value") but has not yet been proposed as a Glossary addition — see the note below.
- **When does a Source get promoted to a Registry Entity?** No governance trigger defined yet.
- **Entity-level state beyond Asset state** — Registry currently models Asset state explicitly but not a general "is this Company/Organization Entity still active" state machine. Surfaced by considering how Data would report an observed change (e.g. a Company ceasing activity); this is a Registry gap, not a Data one, but Data's boundary rule depends on it being resolved.
- **Retention model** — how long Observations are retained and under what rule is Legal & Compliance's decision, deliberately not made here.
- **Personal data classification** — whether Data needs a distinct class of Observation tied to Registry's Person concept, with its own Security/Legal & Compliance handling, is open.
- **Data ↔ Operations boundary** — `120-operations/README.md` already claims "metrics and KPIs" for tracking business consistency. Whether Operations' KPIs are the same Data-owned Metric type, or a separate Operations-maintained concept, is not resolved by this document.

## Status
Draft

## Last Updated
2026-07-20

## Related Domains
- `20-registry`
- `30-trust-engine`
- `50-marketplace`
- `80-intelligence`
- `70-knowledge-hub`
- `145-research`
- `120-operations`
- `160-legal-and-compliance`
- `100-security`
