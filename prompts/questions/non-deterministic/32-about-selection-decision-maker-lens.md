---
id: Q-about-selection-07
area: about-selection
dimension: useCaseClarity
question: "Is the About page suitable for the decision-maker persona lens?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P7
filesToRead:
  - "{{aboutPath}}"
  - "{{personaPath}}"
  - "{{lensPath}}"
preInstructionRef: pre-instructions/about-selection.md
evaluatorTask: "Assess how suitable the selection About is for decision-makers."
outputSchemaRef: output-schemas/about-selection.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

Decision-makers need to grasp the selection logic in one minute of reading.

## Persona Application

The lens (e.g. crypto-trader) makes the focus concrete.
