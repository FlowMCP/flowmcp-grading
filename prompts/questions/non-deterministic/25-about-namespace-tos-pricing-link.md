---
id: Q-about-namespace-06
area: about-namespace
dimension: useCaseClarity
question: "Is a ToS or pricing reference present?"
scoreType: boolean
weight: 0.25
determinism: non-deterministic
tier: P7
filesToRead:
  - "{{aboutPath}}"
preInstructionRef: pre-instructions/about-namespace.md
evaluatorTask: "Check whether the About page links to ToS and/or pricing."
outputSchemaRef: output-schemas/about-namespace.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

Decision-makers need ToS/pricing information to justify adoption.

## Persona Application

Important for decision-makers, less so for hackathon builders — the lens drives the score weighting.
