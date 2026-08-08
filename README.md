# Z Operating System — ZOS

ZOS is the shared operating system and engineering platform for the Z ecosystem.

This repository combines two complementary layers:

1. **Strategic architecture and governance** — the principles, domain models, standards, security, data, intelligence and operating model of ZOS.
2. **Operational product engineering** — the applications, shared packages, database infrastructure and CI/CD that implement those principles.

The repository is the intended **single source of truth** for the Z ecosystem.

---

## Products

ZOS supports multiple independent marketplaces and products:

- **Z Find** — real estate
- **Z Mobility** — automotive
- **Z Jobs** — employment
- **Z Living** — rentals *(future)*
- **Z Finance** — financial services *(future)*

Each product remains an independent marketplace with its own domain semantics, application experience and business lifecycle.

They share selected ZOS capabilities where appropriate.

> **One ecosystem. Multiple marketplaces. Shared intelligence. Separate domain ownership.**

---

## Core architectural principles

ZOS follows the Architectural Constitution v1.1.

Key principles include:

- Platform capabilities and domain ownership remain explicitly separated.
- Canonical identity is shared only where stable cross-vertical identity is required.
- Registry answers **“what is it?”**
- Data Observations answer **“what was observed about it?”**
- Domain-specific lifecycles remain owned by their domains.
- Cross-vertical activation requires explicit consent.
- AI may assist interpretation and processing but does not automatically author canonical truth.
- Integration messages are transport mechanisms, not a universal semantic Event model.
- Shared intelligence does not imply shared ownership of domain semantics.

---

# Repository structure

## Operational platform

```text
apps/