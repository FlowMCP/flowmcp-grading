---
id: Q-about-namespace-06
area: about-namespace
dimension: useCaseClarity
question: "Ist ein ToS- oder Pricing-Verweis vorhanden?"
scoreType: boolean
weight: 0.25
determinism: non-deterministic
tier: P7
filesToRead:
  - "{{aboutPath}}"
preInstructionRef: pre-instructions/about-namespace.md
evaluatorTask: "Pruefe ob die About-Page auf ToS und/oder Pricing verlinkt."
outputSchemaRef: output-schemas/about-namespace.schema.json
personaRequired: true
version: 1.0.0
---

## Begruendung

Decision-Maker brauchen ToS/Pricing-Info, um Adoption zu rechtfertigen.

## Persona-Anwendung

Wichtig fuer Decision-Maker, weniger fuer Hackathon-Builder — Lens steuert Score-Gewichtung.
