---
id: Q-about-selection-05
area: about-selection
dimension: useCaseClarity
question: "Is the skill composition (L1/L2/L3) explained on the About page?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P7
filesToRead:
  - "{{aboutPath}}"
preInstructionRef: pre-instructions/about-selection.md
evaluatorTask: "Check whether the About page explains the skill levels and how they relate."
outputSchemaRef: output-schemas/about-selection.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

Skills are the user-facing concept. Without an explanation, the persona does not
understand the power of the selection.

## Persona Application

An AI engineer needs the L1-L3 hierarchy; for a decision-maker a skill summary is enough.
