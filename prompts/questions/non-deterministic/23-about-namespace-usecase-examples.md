---
id: Q-about-namespace-04
area: about-namespace
dimension: useCaseClarity
question: "Are the use-case examples relevant to the persona?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P7
filesToRead:
  - "{{aboutPath}}"
  - "{{personaPath}}"
  - "{{lensPath}}"
preInstructionRef: pre-instructions/about-namespace.md
evaluatorTask: "Check whether the use-case examples on the About page fit the persona."
outputSchemaRef: output-schemas/about-namespace.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

Generic examples ("Get all data") are worthless; persona-specific ones
("Crypto trader: Get top-10 by volume") are usable.

## Persona Application

Lens-specific examples (crypto-trader lens) are checked against the use cases.
